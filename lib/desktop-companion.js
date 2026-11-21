import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompanionUsageDisplay } from './companion-usage.js';
import { readCompanionInteraction, withCompanionToolContext } from './companion-interaction.js';
import { createCompanionDrafts } from './companion-draft.js';

const exe = fileURLToPath(new URL('../native/windows-x64/daozai.exe', import.meta.url));
const chimeAsset = new URL('./assets/live-window-chime.wav', import.meta.url);
const profileRoot = process.env.DSH_HOME || join(homedir(), '.dsh');
const preferences = join(profileRoot, 'whale-dream-desktop.json');
const nativeData = join(profileRoot, 'whale-dream-live-window');
const noticeFile = join(nativeData, 'replies.json');
const interactionMethods = ['companion-interaction', 'companion-interaction-result'];
const localMethods = ['companion-view', 'companion-events', 'companion-result', 'companion-navigation-result',
  'companion-draft-state', 'companion-draft-file', 'companion-draft-result', ...interactionMethods];
const methods = new Set(['companion-get', 'companion-set', 'companion-sample', 'companion-theme', ...localMethods]);
const defaults = Object.freeze({
  enabled: false, autoCollapse: true, reducedMotion: false, showDetails: true, topPosition: 0, topDisplay: '',
  shape: 'pill', collapsedDisplay: 'amount',
  completionSound: true, completionFlash: true,
});
const defaultTheme = Object.freeze({ scheme: 'dark', accent: '8DA6FF', surface: '202A43', foreground: 'EDF2FF' });
const shapes = new Set(['pill', 'notch', 'minimal']);
const collapsedDisplays = new Set(['amount', 'status', 'title', 'detail']);
const preferenceKeys = new Set(Object.keys(defaults));
const maxRoster = 100;
const maxNotices = 256;
const titleProjection = new Set(['title']);
const modelProjection = new Set(['modelSelection']);
const maxReplyText = 8000;
const maxPreviewText = 6000;
const emptyPreview = Object.freeze({ replyPreview: '', replyPreviewTruncated: false });
const emptyBlocks = Object.freeze([]);
const maxNativeLine = 65536;
const quotaFreshMs = 60000;
const clock = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function onDesktop() {
  const entry = process.argv[1]?.replaceAll('\\', '/') ?? '';
  return process.platform === 'win32' && process.arch === 'x64' &&
    process.connected === true && /\/@deepseek-ai\/dsh-desktop-host\/lib\/index\.js$/i.test(entry);
}

function bounded(value, max) {
  return typeof value === 'string' ? value.slice(0, max).toWellFormed().trim() : '';
}

function routeId(value, limit) {
  return typeof value === 'string' && value.length <= limit && value === value.trim() &&
    value === value.toWellFormed() && !/[\x00-\x1f\x7f]/.test(value) ? value : '';
}

function readView(row) {
  const model = routeId(row?.model, 512);
  const provider = routeId(row?.provider, 200);
  return {
    id: bounded(row?.id, 256), title: bounded(row?.title, 120), model, provider,
    modelLabel: model && provider ? bounded(row?.modelLabel, 120) : '',
    updatedAt: timestamp(row?.updatedAt), pinned: row?.pinned === true,
    running: row?.running === true, waiting: row?.waiting === true, completionUnread: row?.completionUnread === true,
  };
}

function timestamp(value) {
  return Number.isSafeInteger(value) && value > 0 && value < 8.64e15 ? value : 0;
}

function token(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : '';
}

function elapsed(start, finish) {
  if (!start || finish < start) return '';
  const seconds = (finish - start) / 1000;
  if (seconds < 60) return `${Math.round(seconds * 10) / 10} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
}

function* recentOwnEvents(session, limit, end = session.seq) {
  if (typeof session.eventAt !== 'function') return;
  const floor = Math.max(session.inheritedEventCount ?? 0, end - limit);
  for (let seq = end - 1; seq >= floor; seq--) yield session.eventAt(seq);
}

function lastSuccessfulTurn(session, endSeq) {
  let latestEndedAt = 0;
  let end;
  let readable = false;
  for (const event of recentOwnEvents(session, 50000, endSeq)) {
    if (event?.type === 'turn/end') {
      const at = timestamp(event.time);
      if (!latestEndedAt) latestEndedAt = at;
      end = at && event.data?.reason?.kind === 'completed' ? { at, turn: event.data.turn } : undefined;
      readable = false;
    } else if (end && event?.type === 'turn/start' && event.data?.turn === end.turn) {
      if (readable) return { at: end.at, start: timestamp(event.time), latestEndedAt };
      end = undefined;
    } else if (end && !readable && event?.type === 'assistant/message' && event.data?.turn === end.turn) {
      readable = assistantTextBlocks(event).some(isVisibleText);
    }
  }
  return end && readable ? { at: end.at, start: 0, latestEndedAt } : undefined;
}

function assistantTextBlocks(event) {
  const message = event?.type === 'assistant/message' && event.surfaceOp === 'append' ? event.data?.message : undefined;
  return message?.role === 'assistant' && Array.isArray(message.content) ? message.content : emptyBlocks;
}

function isVisibleText(block) {
  return block?.type === 'text' && typeof block.text === 'string' && /[^\s\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(block.text);
}

function assistantPreview(blocks) {
  const parts = [];
  let remaining = maxPreviewText;
  let truncated = false;
  for (const block of blocks) {
    if (!isVisibleText(block)) continue;
    const separator = parts.length ? 2 : 0;
    if (remaining <= separator) {
      truncated = true;
      break;
    }
    const available = remaining - separator;
    const source = block.text;
    let end = Math.min(source.length, available);
    if (end < source.length && source.codePointAt(end - 1) > 0xffff) end--;
    truncated = end < source.length;
    let text = source.slice(0, end).toWellFormed()
      .replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '');
    if (truncated) {
      const lastBreak = text.lastIndexOf('\n');
      if (lastBreak >= Math.max(0, text.length - 120)) text = text.slice(0, lastBreak);
    }
    if (text.trim()) {
      parts.push(text);
      remaining -= text.length + separator;
    }
    if (truncated) break;
  }
  return { replyPreview: parts.join('\n\n'), replyPreviewTruncated: truncated };
}

function latestAssistantPreview(session) {
  for (const event of recentOwnEvents(session, 8192)) {
    const blocks = assistantTextBlocks(event);
    if (!blocks.length) continue;
    const value = assistantPreview(blocks);
    if (value.replyPreview || value.replyPreviewTruncated) return value;
  }
  return emptyPreview;
}

function normalizePreferences(saved) {
  const next = { ...defaults };
  for (const key of preferenceKeys) if (validPreference(key, saved?.[key])) next[key] = saved[key];
  // Reset the previous silent default on upgrade. Once saved here, an explicit mute stays saved.
  if (saved?.completionSoundVersion !== 1 && saved?.completionSound === false) next.completionSound = defaults.completionSound;
  if (next.collapsedDisplay === 'title' && !Object.hasOwn(saved, 'completionSound') && !Object.hasOwn(saved, 'completionFlash')) {
    next.collapsedDisplay = 'amount';
  }
  return next;
}

function validPreference(key, value) {
  if (!preferenceKeys.has(key)) return false;
  if (key === 'topPosition') return validTopPosition(value);
  if (key === 'topDisplay') return validTopDisplay(value);
  if (key === 'shape') return shapes.has(value);
  if (key === 'collapsedDisplay') return collapsedDisplays.has(value);
  return typeof value === 'boolean';
}

function validTopPosition(value) {
  return Number.isFinite(value) && value >= -1 && value <= 1;
}

function validTopDisplay(value) {
  return typeof value === 'string' && value.length <= 480 && value.trim().length > 0 &&
    value.isWellFormed() && !/\p{Cc}/u.test(value);
}

function readTheme(value) {
  const { scheme, accent, surface, foreground } = value && typeof value === 'object' ? value : {};
  if (scheme !== 'light' && scheme !== 'dark') return null;
  if (![accent, surface, foreground].every(color => typeof color === 'string' && /^[\da-f]{6}$/i.test(color))) return null;
  return { scheme, accent: accent.toUpperCase(), surface: surface.toUpperCase(), foreground: foreground.toUpperCase() };
}

export function createDesktopCompanion(ctx, usageSource) {
  const supported = onDesktop();
  let prefs = { ...defaults, enabled: false };
  let theme = defaultTheme;
  let disposed = false;
  let child;
  let launchTimer;
  let themeSaveTimer;
  let retry = 0;
  let error = '';
  let active = readView();
  let catalog = new Map();
  let archived = new Set();
  let activeViewed = false;
  let focusedId = '';
  let preview;
  let completionSequence = 0;
  let preferredClient = '';
  const running = new Map();
  const finishes = new Map();
  const notices = new Map();
  const viewedAt = new Map();
  let noticeTimer;
  let noticeWrites = Promise.resolve();
  const turnStarts = new Map();
  const inspected = new Map();
  const historicalModels = new Map();
  let idleBalance;
  let idleWake;
  let scanTimer;
  let scanRequest;
  let lookup;
  let defaultModel;
  const quotas = new Map();
  let quotaWake;
  const streams = new Map();
  const pendingReplies = new Map();
  const interactions = new Map();
  const interactionRevisions = new Map();
  const pendingInteractions = new Map();
  let watchedInteractionId = '';
  let pendingNavigation;
  let navigationRetry;
  let changes = Promise.resolve();
  const usage = supported && usageSource ? createCompanionUsageDisplay(usageSource, refresh) : null;
  const drafts = createCompanionDrafts({
    nativeData,
    changed: refresh,
    allowed: canShareDraft,
    deliver: (clientId, message) => {
      const res = streams.get(clientId);
      return Boolean(res && streamMessage(res, message));
    },
  });

  function settings() {
    const { topDisplay, ...publicPrefs } = prefs;
    return { supported, ...publicPrefs, ready: Boolean(child?.ready && !child.stopping), error };
  }

  function streamMessage(res, data) {
    if (res.destroyed || res.writableEnded) return false;
    if (res.writableLength > 8192) {
      res.destroy();
      return false;
    }
    res.write(JSON.stringify(data) + '\n');
    return true;
  }

  function broadcast(data) {
    let sent = false;
    for (const res of streams.values()) if (streamMessage(res, data)) sent = true;
    return sent;
  }

  function closeStreams() {
    clearNavigation();
    drafts.watch('', '');
    for (const res of streams.values()) res.end();
    streams.clear();
    preferredClient = '';
    for (const pending of pendingReplies.values()) clearTimeout(pending.timer);
    pendingReplies.clear();
    for (const pending of pendingInteractions.values()) clearTimeout(pending.timer);
    pendingInteractions.clear();
    clearInteractions();
    interactionRevisions.clear();
    watchedInteractionId = '';
  }

  function clearInteractions() {
    for (const entry of interactions.values()) entry.controller?.abort();
    interactions.clear();
  }

  function watchInteraction() {
    const id = prefs.enabled && prefs.showDetails && child?.sessionIds.has(focusedId) && !unavailable(focusedId) ? focusedId : '';
    if (watchedInteractionId === id) return;
    watchedInteractionId = id;
    clearInteractions();
    broadcast({ type: 'watch-interaction', id });
  }

  function interactionFor(id) {
    if (!prefs.showDetails || !id || id !== watchedInteractionId || id !== focusedId || unavailable(id)) return undefined;
    const preferred = interactions.get(preferredClient);
    if (preferred?.card && streams.has(preferredClient)) return preferred;
    return [...interactions.values()].find(entry => entry.card && streams.has(entry.clientId));
  }

  function workspaceIds(key) {
    try { return ctx.get('workspaceRegistry')?.[key]; }
    catch { return undefined; }
  }

  function unavailable(id) {
    return !id || archived.has(id) || workspaceIds('archivedSessionIds')?.includes(id);
  }

  function sessionView(id) {
    return id === active.id ? active : catalog.get(id);
  }

  function lastReply(id) {
    return finishes.get(id) ?? notices.get(id);
  }

  function activity(id) {
    const waiting = sessionView(id)?.waiting === true || !!interactionFor(id);
    const thinking = !waiting && (running.has(id) || sessionView(id)?.running === true);
    const unread = !waiting && !thinking && lastReply(id)?.unread === true;
    return { waiting, thinking, unread };
  }

  function roster() {
    const ids = new Set([active.id, ...running.keys(), ...catalog.keys()]);
    const archiveIds = new Set([...archived, ...(workspaceIds('archivedSessionIds') ?? [])]);
    const pinnedIds = workspaceIds('pinnedSessionIds');
    const pinned = pinnedIds ? new Set(pinnedIds) : null;
    const result = [];
    for (const id of ids) {
      if (!id || archiveIds.has(id)) continue;
      const row = sessionView(id);
      const isPinned = pinned ? pinned.has(id) : row?.pinned === true;
      const status = activity(id);
      const tier = status.unread ? 0 : status.waiting ? 1 : status.thinking ? 2 : 3;
      result.push({ id, ...status, tier, pinned: isPinned, updatedAt: row?.updatedAt || 0, finished: lastReply(id)?.at || 0 });
    }
    return result.sort((a, b) => a.tier - b.tier || (a.unread ? b.finished - a.finished : 0) ||
      Number(b.pinned) - Number(a.pinned) || b.finished - a.finished || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }

  function scheduleHistory(items) {
    if (disposed || !prefs.enabled || !lookup || scanRequest || scanTimer) return;
    const needsInspection = item => {
      const view = sessionView(item.id);
      const key = `${item.updatedAt}:${view?.completionUnread === true}`;
      if (inspected.get(item.id) === key) return false;
      if (!finishes.has(item.id) || view?.completionUnread) return true;
      const selection = knownModel(item.id);
      return prefs.showDetails && !selection?.provider;
    };
    const row = items.find(item => sessionView(item.id)?.completionUnread && needsInspection(item)) ?? items.find(needsInspection);
    if (!row) return;
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      if (!prefs.enabled || disposed || lookup === undefined) return;
      if (unavailable(row.id)) { refresh(); return; }
      const request = new AbortController();
      scanRequest = request;
      inspected.set(row.id, `${row.updatedAt}:${sessionView(row.id)?.completionUnread === true}`);
      void lookup.inspectSession(row.id, session => {
        const turn = lastSuccessfulTurn(session);
        let selection;
        if (prefs.showDetails && !knownModel(row.id)?.provider) {
          try {
            const projection = ctx.get('sessionProjections')?.snapshot(session, modelProjection)?.values?.modelSelection;
            selection = readView(projection?.next ?? projection?.lastUsed);
          } catch { /* An unavailable projection must not discard valid turn metadata. */ }
        }
        return { turn, selection };
      }, request.signal).then(result => {
        if (!result || request.signal.aborted || unavailable(row.id) ||
          row.id !== active.id && !catalog.has(row.id) && !running.has(row.id)) return;
        if (result.turn && (finishes.get(row.id)?.at || 0) <= result.turn.at) {
          const known = notices.get(row.id);
          const rendererUnread = sessionView(row.id)?.completionUnread === true && result.turn.latestEndedAt === result.turn.at;
          const visiblyOpen = (active.id === row.id && activeViewed) || (viewedAt.get(row.id) || 0) >= result.turn.at;
          const unread = !visiblyOpen && (known?.at === result.turn.at ? known.unread : rendererUnread);
          finishes.set(row.id, { at: result.turn.at, start: result.turn.start, unread });
          if (known?.at === result.turn.at && known.unread !== unread) rememberNotice(row.id, result.turn.at, unread);
          if (rendererUnread && (known?.at || 0) < result.turn.at) {
            rememberNotice(row.id, result.turn.at, unread);
          }
        }
        const selection = result.selection;
        if (prefs.showDetails && selection?.provider && selection.model) historicalModels.set(row.id, selection);
      }).catch(() => {}).finally(() => {
        if (scanRequest === request) scanRequest = undefined;
        refresh();
      });
    }, 90);
    scanTimer.unref?.();
  }

  function cancelQuotaWake() {
    if (quotaWake) clearTimeout(quotaWake.timer);
    quotaWake = undefined;
  }

  function focusOn(id) {
    if (focusedId === id) return;
    cancelQuotaWake();
    clearPreview();
    focusedId = id;
    watchInteraction();
    watchDraft();
  }

  function canShareDraft(id) {
    return prefs.enabled && prefs.showDetails && id && id === focusedId &&
      child?.ready && !child.stopping && child.sessionIds.has(id) && !unavailable(id);
  }

  function watchDraft() {
    const id = canShareDraft(focusedId) ? focusedId : '';
    const preferred = commandClient();
    const owner = preferred === 'legacy' ? [...streams.keys()].find(key => key !== 'legacy') : preferred;
    drafts.watch(id, id ? owner ?? '' : '');
  }

  function clearPreview() {
    const previous = preview;
    preview = undefined;
    previous?.request?.abort();
  }

  function canReadPreview(id) {
    return !disposed && prefs.enabled && prefs.showDetails && id && id === focusedId &&
      !unavailable(id) && (active.id === id || catalog.has(id));
  }

  function readPreview(id) {
    if (!canReadPreview(id)) return emptyPreview;
    if (preview?.id === id) return preview.value;
    if (typeof lookup?.inspectSession !== 'function') return emptyPreview;
    const request = new AbortController();
    const current = { id, value: emptyPreview, request };
    preview = current;
    void lookup.inspectSession(id, latestAssistantPreview, request.signal).then(value => {
      if (preview !== current || request.signal.aborted || !canReadPreview(id)) return;
      if (!value) return;
      current.value = value;
      if (value.replyPreview || value.replyPreviewTruncated) refresh();
    }).catch(() => {});
    return emptyPreview;
  }

  function reportAssistantReply(id, event) {
    const opening = turnStarts.get(id);
    const previewable = canReadPreview(id);
    if (!opening && !previewable) return;
    const blocks = assistantTextBlocks(event);
    if (!blocks.some(isVisibleText)) return;
    if (opening?.turn === event.data?.turn) opening.readable = true;
    if (!previewable) return;
    clearPreview();
    preview = { id, value: assistantPreview(blocks) };
    refresh();
  }

  function armQuotaWake(key, at) {
    if (quotaWake?.key === key && quotaWake.at === at) return;
    cancelQuotaWake();
    const timer = setTimeout(() => {
      quotaWake = undefined;
      refresh();
    }, Math.max(1, at - Date.now()));
    timer.unref?.();
    quotaWake = { key, at, timer };
  }

  function readQuota(id, provider, model) {
    if (!usageSource?.quota || !id || !provider || !model) {
      cancelQuotaWake();
      return '';
    }
    const key = `${id}\0${provider}\0${model}`;
    const now = Date.now();
    const previous = quotas.get(key);
    if (previous?.pending || (previous && now - previous.at < quotaFreshMs)) {
      if (!previous.pending && previous.label) armQuotaWake(key, previous.at + quotaFreshMs);
      else cancelQuotaWake();
      return previous.label;
    }
    cancelQuotaWake();
    const label = previous?.label || '';
    const entry = { at: now, pending: true, label: label && !label.startsWith('上次 ') ? `上次 · ${label}` : label };
    quotas.delete(key);
    quotas.set(key, entry);
    if (quotas.size > 12) quotas.delete(quotas.keys().next().value);
    void Promise.resolve().then(() => usageSource.quota(id, provider, model)).then(label => {
      entry.label = bounded(label, 320);
    }).catch(() => {}).finally(() => {
      entry.pending = false;
      if (focusedId === id && quotas.get(key) === entry) refresh();
    });
    return entry.label;
  }

  function knownModel(id) {
    const row = sessionView(id);
    if (row?.model && row.provider) return row;
    const live = running.get(id);
    if (live?.model && live.provider) return live;
    return historicalModels.get(id);
  }

  function cancelIdleWake() {
    if (idleWake) clearTimeout(idleWake.timer);
    idleWake = undefined;
  }

  function readIdleBalance(isIdle) {
    if (!isIdle || !prefs.showDetails || !usageSource?.balance) {
      cancelIdleWake();
      return '';
    }
    let selection;
    if (active.id && !unavailable(active.id)) selection = knownModel(active.id);
    else {
      try { selection = readView(defaultModel?.currentSelection()); } catch { /* No exact account selection is available. */ }
    }
    if (!selection?.provider || !selection.model) {
      cancelIdleWake();
      return '';
    }
    const { provider, model } = selection;
    const sessionId = active.id;
    const key = `${provider}\0${model}`;
    if (idleWake && idleWake.key !== key) cancelIdleWake();
    const now = Date.now();
    const previous = idleBalance?.key === key ? idleBalance : undefined;
    if (previous?.pending || (previous && now - previous.at < quotaFreshMs)) {
      if (!previous.pending && !idleWake) {
        const timer = setTimeout(() => {
          idleWake = undefined;
          refresh();
        }, Math.max(1, previous.at + quotaFreshMs - now));
        timer.unref?.();
        idleWake = { timer, key };
      }
      return previous.label;
    }
    cancelIdleWake();
    const current = { key, at: now, label: previous?.label ?? '', pending: true };
    idleBalance = current;
    void Promise.resolve().then(() => usageSource.balance(sessionId, provider, model)).then(label => {
      current.label = bounded(label, 90);
    }).catch(() => {}).finally(() => {
      current.pending = false;
      if (idleBalance === current) refresh();
    });
    return current.label;
  }

  function details(id, fallback, demand) {
    if (!prefs.showDetails || !id) return { title: '', model: '', modelLabel: '', provider: '', usage: '', quota: '', responseDuration: '', responseTime: '', ...emptyPreview };
    const row = id === active.id ? active : catalog.get(id);
    const selection = knownModel(id);
    const provider = selection?.provider ?? '';
    if (provider) demand.push({ sessionId: id, provider });
    const model = selection?.model || '';
    const finish = lastReply(id);
    return { title: row?.title || fallback?.title || '', model, modelLabel: selection?.modelLabel || '', provider, usage: usage?.label(id, provider) ?? '暂无用量',
      quota: id === focusedId ? readQuota(id, provider, model) : '',
      responseDuration: finish ? elapsed(finish.start, finish.at) : '', responseTime: finish ? clock.format(finish.at) : '',
      ...readPreview(id),
    };
  }

  function refresh() {
    const current = child;
    if (!current?.ready || current.stopping || current.blocked) return;
    watchInteraction();
    watchDraft();
    const demand = [];
    const items = roster();
    const visible = items.slice(0, maxRoster);
    scheduleHistory(visible);
    const ids = new Set(visible.map(row => row.id));
    if (!prefs.showDetails || !ids.has(focusedId)) cancelQuotaWake();
    if (preview && (!canReadPreview(preview.id) || !ids.has(preview.id))) clearPreview();
    const sessions = visible.map(({ id, pinned, thinking, waiting, unread }) => ({ id, pinned, ...details(id, running.get(id), demand),
      thinking, waiting, status: thinking ? 'thinking' : unread ? 'completed' : 'idle',
      interaction: interactionFor(id)?.card,
    }));
    usage?.demand(demand);
    const { autoCollapse, reducedMotion, showDetails, topPosition, topDisplay, shape, collapsedDisplay, completionSound, completionFlash } = prefs;
    const packet = JSON.stringify({
      type: 'state', activeId: ids.has(active.id) ? active.id : '', thinkingCount: items.filter(row => row.thinking).length,
      waitingCount: items.filter(row => row.waiting).length, idleBalance: readIdleBalance(items.every(row => row.tier === 3)), sessions, completionSequence,
      draft: drafts.snapshot(focusedId),
      prefs: { autoCollapse, reducedMotion, showDetails, topPosition, topDisplay, shape, collapsedDisplay, completionSound, completionFlash, sharedDrafts: true }, theme,
    }) + '\n';
    if (packet === current.lastPacket) return;
    current.lastPacket = packet;
    current.sessionIds = ids;
    current.blocked = !current.proc.stdin.write(packet);
  }

  function commandClient() {
    return streams.has(preferredClient) ? preferredClient : streams.keys().next().value;
  }

  function clearNavigation() {
    pendingNavigation = undefined;
    clearTimeout(navigationRetry);
    navigationRetry = undefined;
  }

  function flushNavigation() {
    clearTimeout(navigationRetry);
    if (!pendingNavigation || disposed || !prefs.enabled || pendingNavigation.expires <= Date.now() ||
        (pendingNavigation.id && unavailable(pendingNavigation.id))) {
      clearNavigation();
      return;
    }
    const { id, command, expires } = pendingNavigation;
    const preferred = commandClient();
    const modernClient = preferred === 'legacy' ? [...streams.keys()].find(key => key !== 'legacy') : preferred;
    const clientId = streams.has(pendingNavigation.recipient) ? pendingNavigation.recipient : modernClient;
    const res = streams.get(clientId);
    if (res && streamMessage(res, command)) {
      if (!id) {
        clearNavigation();
        return;
      }
      pendingNavigation.recipient = clientId;
      pendingNavigation.recipients.add(clientId);
    }
    navigationRetry = setTimeout(flushNavigation, Math.min(1250, Math.max(1, expires - Date.now())));
    navigationRetry.unref?.();
  }

  function navigate(id) {
    const expires = Date.now() + 15000;
    const command = id ? { type: 'open', id, requestId: randomUUID(), expires } : { type: 'new' };
    pendingNavigation = { id, command, expires, recipients: new Set() };
    flushNavigation();
  }

  async function loadNotices() {
    try {
      const text = await readFile(noticeFile, 'utf8');
      if (text.length > 128000) return;
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) return;
      for (const record of rows.slice(-maxNotices)) {
        const id = bounded(record?.id, 256);
        const at = timestamp(record?.at);
        if (id && at && typeof record.unread === 'boolean' && !notices.has(id)) notices.set(id, { at, unread: record.unread });
      }
    } catch { /* The first launch has no recorded reply acknowledgements. */ }
  }

  function saveNotices() {
    if (!noticeTimer) return;
    clearTimeout(noticeTimer);
    noticeTimer = undefined;
    const data = JSON.stringify([...notices].map(([id, entry]) => ({ id, ...entry }))) + '\n';
    noticeWrites = noticeWrites.then(async () => {
      await mkdir(nativeData, { recursive: true });
      const temp = `${noticeFile}.${process.pid}.tmp`;
      await writeFile(temp, data, { mode: 0o600 });
      await rename(temp, noticeFile);
    }).catch(error => { if (error.code) console.warn('[whale-dream] reply acknowledgement:', error.code); });
  }

  function rememberNotice(id, at, unread) {
    const previous = notices.get(id);
    if (previous && (previous.at > at || (previous.at === at && previous.unread === unread))) return;
    notices.delete(id);
    notices.set(id, { at, unread });
    if (notices.size > maxNotices) notices.delete(notices.keys().next().value);
    if (!noticeTimer) {
      noticeTimer = setTimeout(saveNotices, 160);
      noticeTimer.unref?.();
    }
  }

  function markRead(id) {
    if (!id) return;
    viewedAt.set(id, Date.now());
    const finish = finishes.get(id);
    const known = notices.get(id);
    if (finish?.unread) {
      finish.unread = false;
      rememberNotice(id, finish.at, false);
      return;
    }
    if (known?.unread) rememberNotice(id, known.at, false);
  }

  function answerReply(current, requestId, ok, error = '') {
    if (current !== child || current.stopping) return;
    current.proc.stdin.write(JSON.stringify({ type: 'reply-result', requestId, ok, error }) + '\n');
  }

  function answerInteraction(current, requestId, ok, error = '') {
    if (current !== child || current.stopping) return;
    current.proc.stdin.write(JSON.stringify({ type: 'interaction-result', requestId, ok, error }) + '\n');
  }

  function submitInteraction(current, { id, key, requestId, decision, answers }) {
    const entry = interactionFor(id);
    const invalid = !entry?.card || entry.card.key !== key || !current.sessionIds.has(id) || pendingInteractions.size >= 8 ||
      [...pendingInteractions.values()].some(pending => pending.id === id && pending.key === key);
    if (invalid) {
      answerInteraction(current, requestId, false, '请求已失效，或正在处理。');
      return;
    }
    const clientStream = streams.get(entry.clientId);
    const deliveryId = randomUUID();
    if (!clientStream || !streamMessage(clientStream, { type: 'interaction', id, key, requestId: deliveryId, decision, answers })) {
      answerInteraction(current, requestId, false, '请打开 DSH 查看待处理请求。');
      return;
    }
    const timer = setTimeout(() => {
      pendingInteractions.delete(deliveryId);
      answerInteraction(current, requestId, false, '提交结果待确认，请在 DSH 中查看。');
    }, 25000);
    timer.unref?.();
    pendingInteractions.set(deliveryId, { id, key, clientId: entry.clientId, current, requestId, timer });
  }

  async function publishInteraction(payload) {
    const clientId = token(payload.clientId);
    const stream = streams.get(clientId);
    const id = payload.id;
    if (!stream || !id || id !== watchedInteractionId || !prefs.showDetails || unavailable(id)) return false;
    if (!Number.isSafeInteger(payload.revision) || payload.revision <= (interactionRevisions.get(clientId) ?? 0)) return false;
    interactionRevisions.set(clientId, payload.revision);
    interactions.get(clientId)?.controller?.abort();
    interactions.delete(clientId);
    if (payload.interaction === null) { refresh(); return true; }
    const incoming = readCompanionInteraction(payload.interaction);
    if (!incoming) { refresh(); return false; }
    const entry = { clientId, card: undefined, controller: new AbortController() };
    interactions.set(clientId, entry);
    let card = incoming.card;
    if (incoming.callId) {
      try {
        card = await lookup?.inspectSession(id, session => withCompanionToolContext(card, session, incoming.callId, incoming.toolName), entry.controller.signal);
      } catch { card = undefined; }
    }
    if (entry !== interactions.get(clientId) || entry.controller.signal.aborted || stream !== streams.get(clientId) ||
      id !== watchedInteractionId || unavailable(id)) return false;
    entry.card = card;
    refresh();
    return true;
  }

  function replyToSession(current, message) {
    const { id, text, requestId } = message;
    if (typeof text !== 'string' || text.length > maxReplyText || !text.trim() || !current.sessionIds.has(id) || unavailable(id)) {
      answerReply(current, requestId, false, '会话不可用或回复超出长度。');
      return;
    }
    const { waiting, thinking } = activity(id);
    if (waiting) {
      answerReply(current, requestId, false, '会话正在等待确认，请先完成当前请求。');
      return;
    }
    if (thinking) {
      answerReply(current, requestId, false, '会话正在思考，请等本轮结束。');
      return;
    }
    const clientId = commandClient();
    const res = streams.get(clientId);
    const deliveryId = randomUUID();
    if (!res || clientId === 'legacy' || pendingReplies.size >= 8 ||
      !streamMessage(res, { type: 'reply', id, text, requestId: deliveryId })) {
      answerReply(current, requestId, false, '请打开 DSH 主界面后重试。');
      return;
    }
    const timer = setTimeout(() => {
      pendingReplies.delete(deliveryId);
      answerReply(current, requestId, false, '发送结果待确认，请在会话中查看。');
    }, 25000);
    timer.unref?.();
    pendingReplies.set(deliveryId, { clientId, current, requestId, timer });
  }

  function scheduleLaunch(delay) {
    if (!prefs.enabled || disposed || child || launchTimer) return;
    launchTimer = setTimeout(() => {
      launchTimer = undefined;
      launch();
    }, delay);
    launchTimer.unref?.();
  }

  function stop(current) {
    if (!current || current.stopping) return;
    current.stopping = true;
    clearTimeout(current.startTimeout);
    current.proc.stdin.end();
    current.stopTimeout = setTimeout(() => current.proc.kill(), 1200);
    current.stopTimeout.unref?.();
  }

  function launch() {
    const initialTheme = `--theme=${theme.scheme},${theme.accent},${theme.surface},${theme.foreground}`;
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP']
      .filter(key => typeof process.env[key] === 'string').map(key => [key, process.env[key]]));
    const proc = spawn(exe, ['--whale-live-window', initialTheme], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env, DAOZAI_DATA_DIR: nativeData },
    });
    const current = { proc, ready: false, stopping: false, blocked: false, lastPacket: '', sessionIds: new Set(),
      seenRequests: new Set(), seenInteractions: new Set(), seenDrafts: new Set(), failure: '' };
    child = current;
    let stdout = '';
    let stderr = '';
    current.startTimeout = setTimeout(() => {
      current.failure = '实况窗启动超时';
      stop(current);
    }, 10000);
    current.startTimeout.unref?.();
    proc.stdout.setEncoding('utf8').on('data', chunk => {
      if (current.stopping || disposed) return;
      stdout += chunk;
      let end;
      while ((end = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, end);
        stdout = stdout.slice(end + 1);
        if (line.length > maxNativeLine) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message?.type === 'ready' && !current.ready) {
          clearTimeout(current.startTimeout);
          current.ready = true;
          error = '';
          refresh();
        }
        if (!current.ready) continue;
        if (message?.type === 'position' && child === current && prefs.enabled && validTopPosition(message.offset)) {
          const patch = { topPosition: message.offset };
          if (Object.hasOwn(message, 'topDisplay')) {
            if (!validTopDisplay(message.topDisplay)) continue;
            patch.topDisplay = message.topDisplay;
          }
          void setPreferences(patch).catch(err => { console.warn('[whale-dream] desktop position:', err.message); });
        }
        if (message?.type === 'focus' && (message.id === '' || current.sessionIds.has(message.id) && !unavailable(message.id))) {
          focusOn(message.id);
          refresh();
        }
        if (message?.type === 'select' && current.sessionIds.has(message.id) && !unavailable(message.id)) {
          focusOn(message.id);
          markRead(message.id);
          refresh();
        }
        if (message?.type === 'open' && current.sessionIds.has(message.id) && !unavailable(message.id)) navigate(message.id);
        if (message?.type === 'new') navigate();
        if (message?.type === 'reply') {
          const { requestId } = message;
          if (Number.isSafeInteger(requestId) && requestId > 0 && !current.seenRequests.has(requestId)) {
            current.seenRequests.add(requestId);
            if (current.seenRequests.size > 200) current.seenRequests.delete(current.seenRequests.values().next().value);
            replyToSession(current, message);
          }
        }
        if (message?.type === 'draft') {
          const { requestId } = message;
          if (Number.isSafeInteger(requestId) && requestId > 0 && !current.seenDrafts.has(requestId)) {
            current.seenDrafts.add(requestId);
            if (current.seenDrafts.size > 200) current.seenDrafts.delete(current.seenDrafts.values().next().value);
            drafts.command(current, message);
          }
        }
        if (message?.type === 'interaction') {
          const { requestId } = message;
          if (Number.isSafeInteger(requestId) && requestId > 0 && !current.seenInteractions.has(requestId)) {
            current.seenInteractions.add(requestId);
            if (current.seenInteractions.size > 200) current.seenInteractions.delete(current.seenInteractions.values().next().value);
            submitInteraction(current, message);
          }
        }
        if (message?.type === 'close') {
          stop(current);
          void setPreferences({ enabled: false }).catch(err => {
            updatePreferences({ ...prefs, enabled: false });
            console.warn('[whale-dream] desktop preference:', err.message);
          });
          break;
        }
      }
      if (stdout.length > maxNativeLine) {
        current.failure = '实况窗通信中断';
        stop(current);
      }
    });
    proc.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(0, 400); });
    proc.stdin.on('error', () => { /* Child close owns recovery. */ });
    proc.stdin.on('drain', () => {
      current.blocked = false;
      if (child === current) refresh();
    });
    proc.on('error', err => { current.failure = err.message; });
    proc.once('close', (code, signal) => {
      clearTimeout(current.startTimeout);
      clearTimeout(current.stopTimeout);
      for (const [requestId, pending] of pendingReplies) {
        if (pending.current !== current) continue;
        clearTimeout(pending.timer);
        pendingReplies.delete(requestId);
      }
      for (const [requestId, pending] of pendingInteractions) {
        if (pending.current !== current) continue;
        clearTimeout(pending.timer);
        pendingInteractions.delete(requestId);
      }
      if (child !== current) return;
      child = undefined;
      focusOn('');
      if (!prefs.enabled || disposed || current.stopping && !current.failure) {
        if (prefs.enabled && !disposed && current.reopen) scheduleLaunch(100);
        return;
      }
      error = '实况窗异常退出，可关闭后重新开启';
      console.warn('[whale-dream] live window:', current.failure || stderr.trim() || `exit ${code ?? signal}`);
      if (retry++ === 0) scheduleLaunch(1700);
      else broadcast({ error: 'launch' });
    });
  }

  function updatePreferences(next) {
    if (disposed) return;
    const changed = prefs.enabled !== next.enabled;
    const detailsChanged = prefs.showDetails !== next.showDetails;
    prefs = next;
    if (detailsChanged) inspected.clear();
    if (!prefs.enabled || !prefs.showDetails) {
      usage?.demand([]);
      quotas.clear();
      cancelQuotaWake();
      cancelIdleWake();
      idleBalance = undefined;
      clearPreview();
      historicalModels.clear();
    }
    if (!changed) { refresh(); return; }
    retry = 0;
    error = '';
    if (prefs.enabled) {
      if (child?.stopping) child.reopen = true;
      scheduleLaunch(900);
      return;
    }
    clearTimeout(launchTimer);
    launchTimer = undefined;
    clearNavigation();
    active = readView();
    activeViewed = false;
    focusOn('');
    archived.clear();
    catalog.clear();
    inspected.clear();
    clearTimeout(scanTimer);
    scanTimer = undefined;
    scanRequest?.abort();
    broadcast({ enabled: false });
    closeStreams();
    stop(child);
  }

  function setPreferences(patch) {
    const change = changes.then(async () => {
      if (disposed || Object.keys(patch).every(key => patch[key] === prefs[key])) return;
      const next = { ...prefs, ...patch };
      await save(next, theme);
      updatePreferences(next);
    });
    changes = change.catch(() => {});
    return change;
  }

  async function save(preferenceState, themeState) {
    await mkdir(dirname(preferences), { recursive: true });
    const temp = `${preferences}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ ...preferenceState, completionSoundVersion: 1, theme: themeState }) + '\n', { mode: 0o600 });
    await rename(temp, preferences);
  }

  function updateTheme(next) {
    if (theme.scheme === next.scheme && theme.accent === next.accent &&
      theme.surface === next.surface && theme.foreground === next.foreground) return;
    theme = next;
    refresh();
    clearTimeout(themeSaveTimer);
    themeSaveTimer = setTimeout(() => {
      themeSaveTimer = undefined;
      changes = changes.then(() => save(prefs, theme)).catch(err => {
        console.warn('[whale-dream] desktop theme cache:', err.message);
      });
    }, 450);
    themeSaveTimer.unref?.();
  }

  function reportAgent(agent, status) {
    const id = bounded(agent?.id, 256);
    if (!id || agent.session?.header?.origin === 'subagent') return;
    if (status === 'running') {
      if (running.has(id)) return;
      running.set(id, agentDetails(agent));
    } else {
      running.delete(id);
    }
    refresh();
  }

  function reportTurn(id, session, event) {
    const at = timestamp(event.time);
    const turn = event.data?.turn;
    if (!Number.isSafeInteger(turn) || !at) return false;
    if (event.type === 'turn/start') {
      turnStarts.set(id, { turn, at, readable: false });
      return false;
    }
    if (event.type !== 'turn/end') return false;
    const opening = turnStarts.get(id);
    if (opening?.turn === turn) turnStarts.delete(id);
    if (event.data.reason?.kind !== 'completed' || unavailable(id) || (lastReply(id)?.at || 0) >= at) return false;
    const verified = opening?.turn === turn
      ? opening.readable && { at, start: opening.at }
      : lastSuccessfulTurn(session, Number.isSafeInteger(event.seq) ? event.seq + 1 : undefined);
    if (verified?.at !== at) return false;
    const unread = prefs.enabled && !(active.id === id && activeViewed);
    finishes.set(id, { at, start: verified.start, unread });
    if (prefs.enabled) {
      rememberNotice(id, at, unread);
      completionSequence++;
    }
    return true;
  }

  function agentDetails(agent) {
    let title = '';
    let selection;
    try {
      const cached = ctx.get('sessionProjections')?.cachedSnapshot?.(agent.session, titleProjection);
      title = bounded(cached?.values?.title, 120);
    } catch { /* Optional title lookup may be unavailable while the session is closing. */ }
    try {
      selection = agent.model?.current?.();
    } catch { /* Status remains authoritative without model metadata. */ }
    return { title, model: routeId(selection?.model, 512), provider: routeId(selection?.provider, 200) };
  }

  if (supported) {
    ctx.effect(() => {
      const readPrefs = readFile(preferences, 'utf8').then(data => JSON.parse(data), err => {
        if (err.code !== 'ENOENT') console.warn('[whale-dream] desktop preference:', err.message);
        return null;
      }).catch(() => null);
      changes = Promise.all([readPrefs, loadNotices()]).then(([saved]) => {
        theme = readTheme(saved?.theme) ?? defaultTheme;
        updatePreferences(normalizePreferences(saved));
      });
      ctx.inject(['agents'], local => {
        for (const agent of local.get('agents').list()) reportAgent(agent, agent.status);
        local.on('agent/status', ({ agent, status }) => reportAgent(agent, status), { global: true });
        const remove = id => {
          running.delete(id);
          inspected.delete(id);
          turnStarts.delete(id);
          // A detached Session can still exist in durable history. The roster is owned by the renderer list.
          refresh();
        };
        local.on('agent/disposed', ({ agent }) => {
          if (running.delete(agent.id)) refresh();
        }, { global: true });
        local.on('api-session/removed', remove, { global: true });
        local.on('session/event', (session, event) => {
          const id = session.header?.id;
          if (!id || session.header?.origin === 'subagent') return;
          if (event.type === 'assistant/message') {
            reportAssistantReply(id, event);
            return;
          }
          if (event.type === 'turn/start' || event.type === 'turn/end') {
            if (reportTurn(id, session, event)) refresh();
            return;
          }
          if (event.type !== 'session/title' && event.type !== 'model/selection') return;
          const item = running.get(id);
          const row = catalog.get(id);
          if (!item && !row && id !== active.id) return;
          const metadata = event.type === 'session/title'
            ? { title: bounded(event.data?.title, 120) }
            : { model: routeId(event.data?.model, 512), provider: routeId(event.data?.provider, 200) };
          if (!metadata.title && !(metadata.model && metadata.provider)) return;
          if (item) Object.assign(item, metadata);
          for (const view of [row, id === active.id ? active : undefined]) {
            if (!view) continue;
            if (metadata.model && (metadata.model !== view.model || metadata.provider !== view.provider)) view.modelLabel = '';
            Object.assign(view, metadata);
          }
          refresh();
        }, { global: true });
        return () => { running.clear(); refresh(); };
      });
      ctx.inject(['sessionQuery'], local => {
        lookup = local.get('sessionQuery');
        refresh();
        return () => {
          scanRequest?.abort();
          clearPreview();
          lookup = undefined;
        };
      });
      ctx.inject(['agentDefaultModel'], local => {
        defaultModel = local.get('agentDefaultModel');
        refresh();
        return () => { defaultModel = undefined; };
      });
      ctx.inject(['workspaceRegistry'], local => {
        local.on('workspace/session-archived', ({ sessionId }) => {
          markRead(sessionId);
          historicalModels.delete(sessionId);
          if (focusedId === sessionId) focusOn('');
          refresh();
        }, { global: true });
      });
      return () => {
        disposed = true;
        clearTimeout(launchTimer);
        clearTimeout(themeSaveTimer);
        clearTimeout(scanTimer);
        scanRequest?.abort();
        cancelQuotaWake();
        cancelIdleWake();
        saveNotices();
        clearPreview();
        usage?.dispose();
        closeStreams();
        stop(child);
      };
    }, 'whale-dream: native live window');
  }

  return async (payload, res, reply) => {
    if (!methods.has(payload.method)) return false;
    if (payload.method === 'companion-get') {
      await changes;
      reply(200, { ok: true, value: settings() });
      return true;
    }
    if (!supported || disposed) {
      reply(409, { ok: false, value: settings() });
      return true;
    }
    if (payload.method === 'companion-sample') {
      const sound = await readFile(chimeAsset);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': sound.length, 'Cache-Control': 'no-store' });
      res.end(sound);
      return true;
    }
    if (payload.method === 'companion-set') {
      const keys = Object.keys(payload).filter(key => key !== 'method');
      if (!keys.length || keys.some(key => key === 'topPosition' || key === 'topDisplay' || !validPreference(key, payload[key]))) {
        reply(400, { ok: false });
      } else {
        await setPreferences(Object.fromEntries(keys.map(key => [key, payload[key]])));
        reply(200, { ok: true, value: settings() });
      }
      return true;
    }
    if (!prefs.enabled) {
      reply(409, { ok: false, value: settings() });
      return true;
    }
    if (localMethods.includes(payload.method) &&
      !/^(?:127(?:\.\d+){3}|::1|::ffff:127(?:\.\d+){3})$/i.test(res.socket?.remoteAddress ?? '')) {
      reply(403, { ok: false });
      return true;
    }
    if (payload.method === 'companion-navigation-result') {
      const pending = pendingNavigation;
      if (pending?.id && pending.id === payload.id && pending.command.requestId === token(payload.requestId) &&
          pending.recipients.has(token(payload.clientId))) clearNavigation();
      reply(200, { ok: true });
      return true;
    }
    if (payload.method === 'companion-draft-file') {
      await drafts.streamFile(token(payload.clientId), token(payload.key), res, reply);
      return true;
    }
    if (payload.method === 'companion-draft-state' || payload.method === 'companion-draft-result') {
      const clientId = token(payload.clientId);
      const ok = payload.method === 'companion-draft-state'
        ? drafts.publish(clientId, payload.id, payload.lease, payload.draft)
        : drafts.result(clientId, payload);
      reply(ok ? 200 : 409, { ok });
      return true;
    }
    if (payload.method === 'companion-view') {
      const clientId = token(payload.clientId);
      if (payload.viewed !== true && clientId && preferredClient && clientId !== preferredClient && streams.has(preferredClient)) {
        reply(200, { ok: true });
        return true;
      }
      active = readView(payload);
      activeViewed = payload.viewed === true && !!clientId;
      if (activeViewed) {
        preferredClient = clientId;
        markRead(active.id);
      }
      archived = new Set(Array.isArray(payload.archivedIds) ? payload.archivedIds.slice(0, 8192).map(id => bounded(id, 256)).filter(Boolean) : []);
      const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, maxRoster).filter(row => row?.archived !== true).map(readView) : [];
      if (payload.archived === true && active.id) archived.add(active.id);
      catalog = new Map(rows.filter(row => row.id).map(row => [row.id, row]));
      const retained = new Set([active.id, ...running.keys(), ...catalog.keys()]);
      for (const key of viewedAt.keys()) if (!retained.has(key)) viewedAt.delete(key);
      for (const key of inspected.keys()) if (!retained.has(key)) inspected.delete(key);
      for (const key of finishes.keys()) if (!retained.has(key)) finishes.delete(key);
      for (const key of historicalModels.keys()) if (!retained.has(key)) historicalModels.delete(key);
      refresh();
      reply(200, { ok: true });
      return true;
    }
    if (payload.method === 'companion-result') {
      const requestId = token(payload.requestId);
      const pending = pendingReplies.get(requestId);
      if (!pending || pending.clientId !== token(payload.clientId) || typeof payload.ok !== 'boolean') {
        reply(404, { ok: false });
        return true;
      }
      pendingReplies.delete(requestId);
      clearTimeout(pending.timer);
      answerReply(pending.current, pending.requestId, payload.ok, payload.ok ? '' : bounded(payload.error, 120) || '回复未发送。');
      reply(200, { ok: true });
      return true;
    }
    if (payload.method === 'companion-interaction') {
      const ok = await publishInteraction(payload);
      reply(ok ? 200 : 409, { ok });
      return true;
    }
    if (payload.method === 'companion-interaction-result') {
      const requestId = token(payload.requestId);
      const pending = pendingInteractions.get(requestId);
      if (!pending || pending.clientId !== token(payload.clientId) || typeof payload.ok !== 'boolean') {
        reply(404, { ok: false });
        return true;
      }
      pendingInteractions.delete(requestId);
      clearTimeout(pending.timer);
      if (payload.ok && watchedInteractionId === pending.id) {
        for (const [clientId, entry] of interactions) {
          if (entry.card?.key === pending.key) { entry.controller.abort(); interactions.delete(clientId); }
        }
      }
      answerInteraction(pending.current, pending.requestId, payload.ok, payload.ok ? '' : bounded(payload.error, 120) || '请求未提交。');
      refresh();
      reply(200, { ok: true });
      return true;
    }
    if (payload.method === 'companion-theme') {
      const next = readTheme(payload);
      if (next) updateTheme(next);
      reply(next ? 200 : 400, { ok: Boolean(next) });
      return true;
    }
    const clientId = token(payload.clientId) || 'legacy';
    if (streams.size >= 4 && !streams.has(clientId)) {
      reply(429, { ok: false });
      return true;
    }
    // DSH compresses responses by default. Small command frames must be delivered immediately.
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    });
    streams.get(clientId)?.end();
    streams.set(clientId, res);
    res.on('close', () => {
      if (streams.get(clientId) !== res) return;
      streams.delete(clientId);
      drafts.disconnect(clientId);
      interactionRevisions.delete(clientId);
      interactions.get(clientId)?.controller?.abort();
      if (interactions.delete(clientId)) refresh();
    });
    res.write('\n');
    if (watchedInteractionId && clientId !== 'legacy') streamMessage(res, { type: 'watch-interaction', id: watchedInteractionId });
    watchDraft();
    drafts.reconnect(clientId);
    if (pendingNavigation) flushNavigation();
    return true;
  };
}
