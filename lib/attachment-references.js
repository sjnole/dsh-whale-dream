import { createImageOrigins } from './image-origins.js';

// The native composer keeps browser uploads and path references in separate
// stores. Only the frozen send call has the authoritative upload order.
const referenceSource = 'whale-dream-attachment-number';
const attachmentPathSource = 'whale-dream-upload-path';
const textNodeId = 'whale-dream-attachment-link';
const packetNodeId = 'whale-dream-attachment-packet';
const uploadPathNodeId = 'whale-dream-hidden-upload-path';
const installMarker = Symbol.for('dsh-whale-dream.attachment-references.installed');
const manifestHeading = '\n\n附件对照（仅本条消息）：\n';
const packetEnd = /\n⟦WD-A1:(\{[^\r\n]{1,50000}\})⟧$/u;
const noncePattern = /^[0-9a-f-]{36}$/u;
const nativeDraftIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const pendingToken = /⟦WD-REF:([0-9a-f-]{36}:\d{1,5})⟧/gu;
const mediaKinds = new Set(['image', 'document', 'table', 'file']);
const frozenPhases = new Set(['adjudicating', 'submitting', 'sending']);

function cleanName(value) {
  return String(value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').slice(0, 240).trim();
}

export function referencePath(mention) {
  return typeof mention === 'string' && mention.startsWith('@')
    ? mention.startsWith('@"') && mention.endsWith('"') ? mention.slice(2, -1) : mention.slice(1)
    : '';
}

export function formatAttachmentSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

function fileKind(name, type) {
  if (type === 'image') return 'image';
  if (/\.(?:xls[xm]?|ods|csv|tsv|numbers)$/i.test(name)) return 'table';
  return /\.(?:doc[xm]?|pdf|ppt[xm]?|txt|md|rtf|odt|pages)$/i.test(name) ? 'document' : 'file';
}

function makeLabel(kind, number, english) {
  if (english) return ({ image: 'Image', document: 'Document', table: 'Table', file: 'File' })[kind] + ' ' + number;
  return ({ image: '图', document: '文档', table: '表格', file: '文件' })[kind] + number;
}

function chipText(nonce, item) {
  return '⟦' + item.label + '·WD-' + nonce + '-' + item.number + '⟧';
}

function rowId(nonce, item) {
  return nonce + ':' + item.number;
}

function newNonce() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return [bytes.slice(0, 8), bytes.slice(8, 12), bytes.slice(12, 16), bytes.slice(16, 20), bytes.slice(20)].join('-');
}

function decodeTail(text, end = text.length) {
  const segment = text.slice(0, end);
  const tail = packetEnd.exec(segment);
  if (!tail) return;
  const start = segment.lastIndexOf(manifestHeading, tail.index);
  if (start < 0) return;
  let value;
  try { value = JSON.parse(tail[1]); } catch { return; }
  if (!noncePattern.test(value?.batch) || !Array.isArray(value.items) || !value.items.length || value.items.length > 128) return;
  const numbers = new Set();
  const slots = new Set();
  for (const item of value.items) {
    if (!mediaKinds.has(item?.kind) || !Number.isSafeInteger(item.number) || item.number < 1 || item.number > 10000 ||
        numbers.has(item.number) || !cleanName(item.name) || typeof item.label !== 'string' ||
        (item.label !== makeLabel(item.kind, item.number, false) && item.label !== makeLabel(item.kind, item.number, true))) return;
    numbers.add(item.number);
    if (typeof item.pathReference === 'string') {
      if (!referencePath(item.pathReference) || !text.slice(0, tail.index).includes(item.pathReference) || item.slot !== undefined) return;
    } else {
      if (!Number.isSafeInteger(item.slot) || item.slot < 0 || slots.has(item.slot)) return;
      slots.add(item.slot);
    }
  }
  const hiddenPaths = value.hiddenPaths ?? [];
  if (!Array.isArray(hiddenPaths) || hiddenPaths.length > value.items.length) return;
  let previousEnd = 0;
  const visiblePaths = value.items.filter(item => item.pathReference !== undefined).map(item => item.pathReference);
  for (const range of hiddenPaths) {
    if (!Number.isSafeInteger(range?.start) || !Number.isSafeInteger(range?.end) ||
        range.start < previousEnd || range.end <= range.start || range.end > start) return;
    const pathIndex = visiblePaths.indexOf(text.slice(range.start, range.end).replace(/^ | $/gu, ''));
    if (pathIndex < 0) return;
    visiblePaths.splice(pathIndex, 1);
    previousEnd = range.end;
  }
  return { ...value, start };
}

function decodePacket(text) {
  if (typeof text !== 'string') return;
  const tail = decodeTail(text);
  if (!tail) return;
  // 同一份发送文本可能被重复包裹（多个客户端实例），此时尾部会连续
  // 追加多组附件对照；从最靠前的一组开始隐藏，避免重复内容外露。
  let start = tail.start;
  for (;;) {
    const previous = decodeTail(text, start);
    if (!previous) break;
    start = previous.start;
  }
  return { ...tail, start };
}

function messageContent(message) {
  if (!Array.isArray(message?.content) || message.source?.kind !== 'user') return;
  const text = message.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('');
  const uploads = message.content.filter(part => (part?.type === 'image' || part?.type === 'file') && typeof part.attachment?.attachmentId === 'string');
  return { message, text, uploads };
}

function sourceMessageCaption(text, packet) {
  const limit = Math.min(packet?.start ?? text.length, 4096);
  let body = '';
  let offset = 0;
  for (const range of packet?.hiddenPaths ?? []) {
    if (range.start >= limit) break;
    body += text.slice(offset, range.start);
    offset = range.end;
  }
  body += text.slice(offset, limit);
  const labels = new Map((packet?.items ?? []).map(item => [item.number, item.label]));
  const clean = body.split(/\r?\n/u).map(line => {
    const withoutChips = line.replace(/⟦([^⟦⟧\r\n]+)·WD-([0-9a-f-]{36})-(\d+)⟧/gu,
      (_token, label, batch, number) => batch === packet?.batch && labels.get(Number(number)) === label ? label : '');
    return withoutChips.replace(/^\s*(?:(?:#{1,6}|>|[-*+]|\d+[.)、])\s+)+/u, '')
      .replace(/[\t ]+/g, ' ').trim();
  }).filter(line => line && !/^(?:(?:图|表格|文档|文件|Image|Table|Document|File)\s*\d+[\s、,，]*)+$/iu.test(line));
  const preview = clean.join('\n');
  const first = clean.find(line => !/^(?:你好|您好|谢谢|hi|hello|thanks)[！!。.]?$/iu.test(line)) ?? clean[0];
  const sentence = first?.split(/(?<=[。！？!?])|(?<=\.)\s+/u)[0];
  const shorten = (value, length) => {
    const characters = Array.from(value ?? '');
    return characters.length > length ? characters.slice(0, length - 1).join('').trimEnd() + '…' : value ?? '';
  };
  return { messageTitle: shorten(sentence, 38), messagePreview: shorten(preview, 220) };
}

function listSentEntries(sessionId, event, recorded) {
  const content = messageContent(recorded);
  if (!content) return [];
  const { message, text, uploads } = content;
  const packet = decodePacket(text);
  if (!packet && !uploads.length) return [];
  const base = {
    sessionId, seq: event.seq, time: event.time,
    messageId: typeof message.id === 'string' ? message.id : typeof message.messageId === 'string' ? message.messageId : undefined,
    ...sourceMessageCaption(text, packet),
  };
  const messageKey = base.messageId ?? String(event.seq);
  const originalEntries = () => uploads.map(({ type, attachment }, slot) => ({
    ...base, id: messageKey + ':' + slot, slot,
    name: cleanName(attachment.name) || (type === 'image' ? '图片' : '文件'),
    kind: fileKind(attachment.name, type), label: '', attachment, size: attachment.bytes, source: 'upload',
  }));
  if (!packet) return originalEntries();
  const matchedSlots = packet.items.filter(item => typeof item.slot === 'number');
  // The entire native ordinal set must match. Never bind labels to a subset
  // when a provider or an older host has reordered or omitted the typed parts.
  if (uploads.length !== matchedSlots.length || matchedSlots.some(item =>
    !uploads[item.slot] || uploads[item.slot].type !== (item.kind === 'image' ? 'image' : 'file') ||
    (item.nativeId !== undefined && item.nativeId !== uploads[item.slot].attachment.attachmentId))) return originalEntries();
  return packet.items.map(item => {
    const native = uploads[item.slot]?.attachment;
    return {
      ...base, ...item, id: rowId(packet.batch, item), batch: packet.batch,
      ...(native ? { attachment: native, size: native.bytes, source: 'upload' } :
        { path: referencePath(item.pathReference), source: 'path' }),
    };
  });
}

const sentStyles = `
[data-wd-sent-stack]{align-items:stretch!important;width:min(100%,var(--wd-sent-width,620px));max-width:min(82%,100%)!important;min-width:0;box-sizing:border-box;padding:12px;background:var(--dsw-specific-input-major,var(--wd-surface));border:1px solid var(--dsw-alias-border-l2,transparent);border-radius:15px}
[data-wd-sent-stack]>[data-message-bubble]{align-self:stretch!important;width:100%;max-width:none!important;box-sizing:border-box;text-align:start;padding-inline:0!important;background:transparent!important}
[data-wd-sent-stack]>[data-wd-sent-rail]{display:flex!important;flex-wrap:nowrap!important;align-self:stretch!important;justify-content:flex-start!important;align-items:flex-start!important;gap:8px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;overscroll-behavior-inline:contain;padding:3px 2px 5px}
[data-wd-sent-rail]>[data-wd-sent-entry]{order:var(--wd-sent-index,0);display:flex!important;align-items:center;gap:10px;box-sizing:border-box;position:relative;flex:0 0 min(196px,86%);min-width:0;height:64px;padding:8px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:10px;background:color-mix(in srgb,currentColor 5%,var(--dsw-specific-input-major,transparent));color:inherit;font:inherit;text-align:start}
[data-wd-sent-rail]>button[data-wd-sent-entry]{cursor:pointer}
[data-wd-sent-rail]>[data-wd-sent-entry]:hover{border-color:color-mix(in srgb,var(--wd-palette-accent,#7b8cff) 42%,transparent)}
[data-wd-sent-entry]>[data-wd-sent-glyph]{display:grid;place-items:center;flex:none;width:36px;height:38px;border-radius:7px;background:color-mix(in srgb,var(--wd-sent-glyph,#9ca9ed) 18%,transparent);color:var(--wd-sent-glyph,#9ca9ed);font-size:12px;font-weight:750}
[data-wd-sent-entry][data-wd-sent-kind=table]{--wd-sent-glyph:light-dark(#237256,#8cd7b4)}
[data-wd-sent-entry][data-wd-sent-kind=document]{--wd-sent-glyph:light-dark(#405aaa,#adbbfc)}
[data-wd-sent-entry][data-wd-sent-kind=file]{--wd-sent-glyph:var(--dsw-alias-label-secondary)}
[data-wd-sent-card-info]{min-width:0;display:grid;gap:5px;flex:1;pointer-events:none}
[data-wd-sent-card-name],[data-wd-sent-card-facts]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-wd-sent-card-name]{font-size:12px;font-weight:650;line-height:16px}
[data-wd-sent-card-meta]{display:flex;align-items:center;gap:6px;min-width:0;color:var(--dsw-alias-label-secondary);font-size:10px;line-height:14px;font-variant-numeric:tabular-nums}
[data-wd-sent-upload]:not([data-wd-sent-image])>:not([data-wd-sent-card-info],[data-wd-sent-glyph]){display:none!important}
[data-wd-sent-image]>[data-slot]{display:block!important;position:relative;flex:0 0 43px;width:43px;height:44px;overflow:hidden;border-radius:7px}
[data-wd-sent-image]{cursor:pointer}
[data-wd-sent-image] [data-variant]{display:block!important;position:relative!important;box-sizing:border-box;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;overflow:hidden;border-radius:inherit}
[data-wd-sent-image] [data-variant] img{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:100%!important;max-height:100%!important;aspect-ratio:auto!important;object-fit:cover!important;object-position:center}
[data-wd-sent-image]:focus-within{outline:2px solid var(--wd-palette-accent,#7b8cff);outline-offset:-2px}
[data-wd-sent-pager]{display:flex;justify-content:flex-end;gap:4px;margin-top:-4px}
[data-wd-sent-pager][hidden]{display:none}
[data-wd-sent-pager] button{display:grid;place-items:center;width:24px;height:22px;padding:0;border:1px solid var(--dsw-alias-border-l2,transparent);border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
[data-wd-sent-pager] button:disabled{opacity:.38;cursor:default}
[data-wd-sent-pager] button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
[data-wd-sent-stack] [data-wd-sent-number],[data-wd-sent-reference]{white-space:nowrap;border:1px solid color-mix(in srgb,var(--wd-accent,#7b8cff) 48%,transparent);background:color-mix(in srgb,var(--wd-accent,#7b8cff) 17%,transparent);color:inherit;font:inherit;font-size:.83em;border-radius:6px;line-height:1.4;padding:1px 5px}
[data-wd-sent-stack] [data-wd-sent-number]{display:inline-flex;align-items:center;flex:none;font-size:10px;line-height:14px}
[data-wd-sent-reference]{display:inline-flex;vertical-align:baseline;align-items:center}
[data-wd-sent-reference]:hover,button[data-wd-sent-number]:hover{filter:brightness(1.2)}
[data-wd-sent-reference]:focus-visible,[data-wd-sent-number]:focus-visible,[data-wd-sent-path]:focus-visible{outline:2px solid var(--wd-accent,#7b8cff);outline-offset:2px}
[data-wd-sent-entry][data-wd-reference-highlight]{outline:2px solid var(--wd-accent,#7b8cff);outline-offset:-2px}
@media(max-width:620px){[data-wd-sent-stack]{max-width:93%!important}}
`;

export function createAttachmentReferences(ctx, language = () => 'zh', jsx) {
  const imageOrigins = createImageOrigins();
  const drafts = new Map();
  const activeComposers = new WeakMap();
  const sessions = new Map();
  const listeners = new Set();
  const decorations = new Map();
  const separators = new WeakMap();
  const railRefresh = new Map();
  let railObserver;
  const disposers = [];
  const textCache = new Map();
  const fileIntakes = new Map();
  const draftPaths = new Map();
  const draftListeners = new Set();
  const uploadMarker = newNonce();
  const uploadTokens = new RegExp('⟦WD-UPL:' + uploadMarker + ':([^⟧]+)⟧', 'gu');
  let frame = 0;
  let disposed = false;
  let detachedIntake = false;
  const english = () => language() === 'en';
  const copy = (zh, en) => english() ? en : zh;
  const get = name => { try { return ctx.get(name); } catch { return undefined; } };
  const bindingFor = id => id && get('sessions')?.binding?.(id);
  const sessionFor = node => node?.closest?.('[data-conversation-session]')?.dataset.conversationSession;

  function inputFor(id) {
    const binding = bindingFor(id);
    try { return binding && get('conversation')?.input?.for?.(binding.ctx); } catch { return undefined; }
  }

  const pathStorageKey = id => 'whale-dream.draft-paths.v1:' + id;

  function pathRecord(sessionId, id, name, pathReference) {
    if (!noncePattern.test(id) || typeof pathReference !== 'string' || pathReference.length > 4096 ||
        !referencePath(pathReference) || /[\p{Cc}\p{Cf}]/u.test(pathReference)) return;
    const label = cleanName(name) || cleanName(referencePath(pathReference).split(/[\\/]/).at(-1));
    if (!label) return;
    return { id, sessionId, name: label, label, title: label, pathReference };
  }

  function listPaths(sessionId) {
    if (!detachedIntake || !sessionId) return [];
    if (!draftPaths.has(sessionId)) {
      let saved;
      try { saved = JSON.parse(window.localStorage.getItem(pathStorageKey(sessionId)) ?? '[]'); } catch {}
      const paths = new Map();
      for (const record of Array.isArray(saved) ? saved : []) {
        const validated = pathRecord(sessionId, record?.id, record?.name, record?.pathReference);
        if (validated) paths.set(validated.id, validated);
      }
      draftPaths.set(sessionId, [...paths.values()]);
    }
    return draftPaths.get(sessionId);
  }

  function updatePaths(sessionId, paths) {
    draftPaths.set(sessionId, paths);
    try {
      if (paths.length) window.localStorage.setItem(pathStorageKey(sessionId), JSON.stringify(paths));
      else window.localStorage.removeItem(pathStorageKey(sessionId));
    } catch {}
    for (const listener of draftListeners) listener(sessionId);
  }

  function ensureDraft(sessionId, input) {
    if (!sessionId || !input) return;
    let state = drafts.get(sessionId);
    if (!state || state.input !== input) {
      state = { sessionId, input, nonce: newNonce(), next: 1, byIdentity: new Map(), entries: new Map(), removed: new Set() };
      drafts.set(sessionId, state);
      for (const id of drafts.keys()) if (id !== sessionId && !bindingFor(id)) drafts.delete(id);
    }
    return state;
  }

  function rememberDraftEntry(state, identity, info, key) {
    let item = state.byIdentity.get(identity);
    if (!item) {
      // The host carries attachment IDs with the draft when the workspace changes.
      // Counter-based keys start at 1, so suffix 0 identifies a native upload.
      const attachmentId = info.draftAttachmentId;
      const stableKey = typeof attachmentId === 'string' && nativeDraftIdPattern.test(attachmentId)
        ? attachmentId + ':0' : undefined;
      item = { key: key ?? stableKey ?? (state.nonce + ':' + state.next++), number: 0, label: '', ...info };
      state.byIdentity.set(identity, item);
      state.entries.set(item.key, item);
      state.removed.delete(item.key);
    }
    return item;
  }

  function syncDetachedEntries(sessionId, input) {
    const state = ensureDraft(sessionId, input);
    if (!state) return;
    for (const row of listPaths(sessionId)) {
      rememberDraftEntry(state, 'local:' + row.id, {
        kind: fileKind(row.name, 'file'), name: row.name, pathReference: row.pathReference,
        sessionId, pathId: row.id,
      }, row.id + ':1');
    }
    return state;
  }

  function bindFileIntake(input, sessionId) {
    if (!detachedIntake || !sessionId || !input || typeof input.addFiles !== 'function' ||
        typeof input.submit !== 'function' || fileIntakes.has(input)) return input;
    for (const [oldInput, record] of fileIntakes) {
      if (bindingFor(record.sessionId)) continue;
      record.restore();
      fileIntakes.delete(oldInput);
      draftPaths.delete(record.sessionId);
    }
    const addFiles = input.addFiles;
    const submit = input.submit;
    const wrappedAdd = function(refs, ids) {
      if (!Array.isArray(refs) || !refs.length) return addFiles.call(this, refs, ids);
      const detached = [], untouched = [];
      for (const ref of refs) {
        const row = ref?.source === 'reference' && ref.appearance === 'file' &&
          pathRecord(sessionId, newNonce(), ref.label, ref.ref);
        if (row) detached.push(row);
        else untouched.push(ref);
      }
      const accepted = addFiles.call(this, untouched, ids);
      if (accepted && detached.length) {
        updatePaths(sessionId, [...listPaths(sessionId), ...detached]);
        syncDetachedEntries(sessionId, input);
      }
      return accepted;
    };
    const wrappedSubmit = function(mode, source, allowEmpty) {
      if (!listPaths(sessionId).length) return submit.call(this, mode, source, allowEmpty);
      const state = input.state?.getSnapshot?.();
      if (!state || frozenPhases.has(state.phase)) return submit.call(this, mode, source, allowEmpty);
      if (state.phase === 'claimed' || state.draft.trimStart().startsWith('/')) {
        notifyInput(sessionId, '运行斜杠命令前请先移除独立附件，或作为普通消息发送。', 'Remove the attached files before running a slash command, or send them with a normal message.');
        return;
      }
      syncDetachedEntries(sessionId, input);
      return submit.call(this, mode, source, allowEmpty || !state.draft.trim() && !state.attachmentIds.length);
    };
    try {
      input.submit = wrappedSubmit;
      input.addFiles = wrappedAdd;
    } catch {
      if (input.submit === wrappedSubmit) input.submit = submit;
      return input;
    }
    fileIntakes.set(input, { sessionId, restore() {
      if (input.addFiles === wrappedAdd) input.addFiles = addFiles;
      if (input.submit === wrappedSubmit) input.submit = submit;
    } });
    return input;
  }

  function listDraftPathsForSession(sessionId) {
    const input = bindFileIntake(inputFor(sessionId), sessionId);
    return input ? listPaths(sessionId) : [];
  }

  function listDraftPaths(composer) {
    return listDraftPathsForSession(sessionFor(composer));
  }

  function removeDraftPathForSession(sessionId, id) {
    const input = inputFor(sessionId);
    const snapshot = input?.state?.getSnapshot?.();
    if (!snapshot || frozenPhases.has(snapshot.phase)) return false;
    const paths = listPaths(sessionId);
    const remaining = paths.filter(row => row.id !== id);
    if (remaining.length === paths.length) return false;
    updatePaths(sessionId, remaining);
    const state = drafts.get(sessionId);
    const entry = state?.byIdentity.get('local:' + id);
    if (entry) {
      state.byIdentity.delete('local:' + id);
      state.entries.delete(entry.key);
      state.removed.add(entry.key);
      renumberDraft(state);
    }
    return true;
  }

  function removeDraftPath(composer, id) {
    return removeDraftPathForSession(sessionFor(composer), id);
  }

  function adoptDraftPath(composer, record) {
    const sessionId = sessionFor(composer);
    const input = bindFileIntake(inputFor(sessionId), sessionId);
    const snapshot = input?.state?.getSnapshot?.();
    if (!detachedIntake || !snapshot || frozenPhases.has(snapshot.phase)) return false;
    const row = pathRecord(sessionId, noncePattern.test(record?.id) ? record.id : newNonce(), record?.name, record?.pathReference);
    if (!row) return false;
    const paths = listPaths(sessionId);
    if (!paths.some(existing => existing.id === row.id)) updatePaths(sessionId, [...paths, row]);
    syncDetachedEntries(sessionId, input);
    return true;
  }

  function hasOnlyDraftPaths(composer) {
    const sessionId = sessionFor(composer);
    const input = inputFor(sessionId);
    const state = input?.state?.getSnapshot?.();
    return Boolean(listPaths(sessionId).length && state && state.phase === 'plain' &&
      !state.draft.trim() && !state.attachmentIds.length);
  }

  function submitOnlyPaths(composer) {
    if (!hasOnlyDraftPaths(composer)) return false;
    const sessionId = sessionFor(composer);
    const input = bindFileIntake(inputFor(sessionId), sessionId);
    if (!fileIntakes.has(input) || input.editor?.isComposing?.() || bindingFor(sessionId)?.session?.getSnapshot?.()?.running) return false;
    input.submit('queue', 'click');
    return true;
  }

  function openDraftPath(composer, id) {
    const sessionId = sessionFor(composer);
    const row = listPaths(sessionId).find(path => path.id === id);
    return Boolean(row && openEntry({ ...row, path: referencePath(row.pathReference) }));
  }

  function restoreUploadPaths(text, items = []) {
    const hiddenPaths = [];
    const availablePaths = items.filter(item => item.pathReference).map(item => item.pathReference);
    let restored = '';
    let cursor = 0;
    for (const match of text.matchAll(uploadTokens)) {
      let mention;
      try { mention = decodeURIComponent(match[1]); } catch { continue; }
      if (!referencePath(mention)) continue;
      restored += text.slice(cursor, match.index);
      const start = restored.length;
      const previous = restored.at(-1);
      if (previous && !/\s/u.test(previous)) restored += ' ';
      restored += mention;
      cursor = match.index + match[0].length;
      const next = text[cursor];
      if (next && !/\s/u.test(next)) restored += ' ';
      const pathIndex = availablePaths.indexOf(mention);
      if (pathIndex >= 0) {
        availablePaths.splice(pathIndex, 1);
        hiddenPaths.push({ start, end: restored.length });
      }
    }
    return { text: restored + text.slice(cursor), hiddenPaths };
  }

  function notifyInput(id, zh, en) {
    inputFor(id)?.notify?.('error', copy(zh, en));
  }

  function publish(sessionId) {
    for (const listener of listeners) listener(sessionId);
    schedule();
  }

  function cachedPacket(text) {
    if (!textCache.has(text)) {
      textCache.set(text, decodePacket(text));
      if (textCache.size > 64) textCache.delete(textCache.keys().next().value);
    }
    return textCache.get(text);
  }

  function syncSession(sessionId) {
    const binding = bindingFor(sessionId);
    if (!binding?.eventSource) {
      sessions.get(sessionId)?.off?.();
      sessions.delete(sessionId);
      return;
    }
    let state = sessions.get(sessionId);
    if (state?.binding !== binding) {
      state?.off?.();
      for (const [otherId, previous] of sessions) {
        if (otherId === sessionId || bindingFor(otherId) === previous.binding) continue;
        previous.off?.();
        sessions.delete(otherId);
      }
      state = { binding, revision: undefined, entries: [], byId: new Map(), byBatch: new Map(),
        messages: new Map(), queued: new Map(), inbox: new Map() };
      sessions.set(sessionId, state);
      state.off = binding.eventSource.subscribe?.(() => {
        const entries = state.entries;
        if (syncSession(sessionId)?.entries !== entries) publish(sessionId);
      });
    }
    const window = binding.eventSource.getSnapshot?.();
    if (!window || state.revision === window.revision) return state;
    const simpleAppend = state.revision !== undefined && window.revision === state.revision + 1 && window.change?.kind === 'append';
    state.revision = window.revision;
    if (!simpleAppend) {
      state.messages.clear();
      state.queued.clear();
      state.inbox.clear();
    }
    let changed = !simpleAppend;
    for (const entry of (simpleAppend ? window.change.entries : window.entries) ?? []) {
      const event = entry?.event;
      if (!event) continue;
      if (event.type === 'user/message') {
        const rows = listSentEntries(sessionId, event, event.data);
        if (!rows.length || !rows[0].messageId) continue;
        imageOrigins.admit(sessionId, rows);
        state.messages.set(rows[0].messageId, rows);
        state.queued.delete(rows[0].messageId);
        changed = true;
      } else if (event.type === 'agent/inbox/spliced' && Array.isArray(event.data?.inserted)) {
        const { target, start, removedCount = 0, inserted, outcome } = event.data;
        let queue = state.inbox.get(target);
        if (!queue) state.inbox.set(target, queue = []);
        const removed = queue.splice(start, removedCount, ...inserted.map(message => message.id));
        if (outcome === 'canceled') for (const key of removed) changed = state.queued.delete(key) || changed;
        for (const record of inserted) {
          const rows = listSentEntries(sessionId, event, record);
          if (!rows.length || !rows[0].messageId || state.messages.has(rows[0].messageId)) continue;
          imageOrigins.admit(sessionId, rows);
          state.queued.set(rows[0].messageId, rows);
          changed = true;
        }
      }
    }
    if (changed) {
      state.entries = [...state.messages.values(), ...state.queued.values()].flat().sort((a, b) => a.seq - b.seq);
      state.byId.clear();
      state.byBatch.clear();
      for (const entry of state.entries) {
        state.byId.set(entry.id, entry);
        if (!entry.batch) continue;
        let rows = state.byBatch.get(entry.batch);
        if (!rows) state.byBatch.set(entry.batch, rows = []);
        rows.push(entry);
      }
    }
    return state;
  }

  function exactLiveItem(item, input, ids) {
    if (item.draftAttachmentId) return ids.includes(item.draftAttachmentId);
    if (item.pathId) return listPaths(item.sessionId).some(row => row.id === item.pathId);
    const node = input?.editor?.getElementByKey?.(item.nodeKey);
    return !!node?.isConnected;
  }

  function reconcileInlineReferences(input, removed, labels) {
    const editor = input?.editor;
    if ((!removed.size && !labels.size) || !editor || editor.isComposing?.() || frozenPhases.has(input.state?.getSnapshot?.()?.phase)) return;
    const state = editor.getEditorState?.();
    const changes = [];
    state?.read?.(() => {
      for (const [key, node] of state._nodeMap ?? []) {
        if (node.getSource?.() !== referenceSource) continue;
        const identity = node.getReference?.();
        const label = labels.get(identity);
        if (removed.has(identity) || label && node.__label !== label) changes.push({ key, identity, label });
      }
    });
    if (!changes.length) return;
    editor.update(() => {
      const snapshot = editor.getEditorState();
      for (const { key, identity, label } of changes) {
        const node = snapshot._nodeMap?.get(key);
        if (!node?.isAttached?.() || node.getSource?.() !== referenceSource || node.getReference?.() !== identity) continue;
        if (removed.has(identity)) {
          const owned = separators.get(editor);
          const next = node.getNextSibling();
          if (next?.getType() === 'text' && next.getKey() === owned?.get(key) && next.getTextContent().startsWith(' ')) {
            const rest = next.getTextContent().slice(1);
            if (rest) next.setTextContent(rest);
            else next.remove();
          }
          owned?.delete(key);
          node.remove();
        } else if (typeof node.__label === 'string' && typeof node.__clipboardText === 'string') {
          const writable = node.getWritable();
          writable.__label = label;
          writable.__clipboardText = '【' + label + '】';
        }
      }
    }, { discrete: true, tag: ['history-push', 'skip-dom-selection'] });
  }

  function trackComposer(composer, descriptors) {
    if (disposed || !Array.isArray(descriptors)) return [];
    const sessionId = sessionFor(composer);
    const input = bindFileIntake(inputFor(sessionId), sessionId);
    if (!input?.insertReference || !input.actions?.captureInsertion || !get('inputTriggers')?.registerSource) {
      return descriptors.map(() => undefined);
    }
    const state = syncDetachedEntries(sessionId, input);
    activeComposers.set(composer, { sessionId, input });
    const ids = input.state.getSnapshot().attachmentIds;
    for (const [identity, item] of state.byIdentity) {
      if (exactLiveItem(item, input, ids)) continue;
      state.byIdentity.delete(identity);
      state.entries.delete(item.key);
      state.removed.add(item.key);
    }
    const matching = descriptors.map(descriptor => {
      const kind = mediaKinds.has(descriptor?.kind) ? descriptor.kind : undefined;
      const name = cleanName(descriptor?.name);
      const attachmentId = descriptor?.draftAttachmentId;
      const path = descriptor?.pathReference;
      const pathId = descriptor?.pathId;
      const nodeKey = descriptor?.nodeKey;
      if (pathId) {
        const detached = state.byIdentity.get('local:' + pathId);
        return detached?.pathReference === path ? detached : undefined;
      }
      if (!kind || !name || (attachmentId ? !ids.includes(attachmentId) : !nodeKey || !referencePath(path))) return;
      const identity = attachmentId ? 'upload:' + attachmentId : 'path:' + nodeKey;
      return rememberDraftEntry(state, identity, { kind, name,
        ...(attachmentId ? { draftAttachmentId: attachmentId } : { pathReference: path, nodeKey }) });
    });
    renumberDraft(state);
    return matching;
  }

  function renumberDraft(state) {
    const labels = new Map();
    let number = 0;
    for (const item of state.entries.values()) {
      item.number = ++number;
      item.label = makeLabel(item.kind, item.number, english());
      labels.set(item.key, item.label);
    }
    reconcileInlineReferences(state.input, state.removed, labels);
  }

  function releaseComposer(composer) {
    activeComposers.delete(composer);
  }

  function focusAfterReference(input, previousNodes, key, addedSpace) {
    const editor = input.editor;
    const snapshot = editor?.getEditorState?.();
    const root = editor?.getRootElement?.();
    const chip = previousNodes && snapshot?.read(() => {
      for (const [nodeKey, node] of snapshot._nodeMap) {
        if (!previousNodes.has(nodeKey) && node.getSource?.() === referenceSource && node.getReference?.() === key) {
          return node;
        }
      }
    });
    if (!chip || !root) {
      input.focus?.();
      return;
    }
    root.focus({ preventScroll: true });
    editor.update(() => {
      if (!chip.isAttached()) return;
      const next = chip.getNextSibling();
      if (next?.getType() === 'text') {
        // Select inside editable text, so Chromium cannot resolve an ambiguous
        // element boundary to the leading edge of the non-editable chip.
        const offset = next.getTextContent().startsWith(' ') ? 1 : 0;
        if (addedSpace && offset) {
          let owned = separators.get(editor);
          if (!owned) separators.set(editor, owned = new Map());
          for (const nodeKey of owned.keys()) if (!snapshot._nodeMap.has(nodeKey)) owned.delete(nodeKey);
          owned.set(chip.getKey(), next.getKey());
        }
        next.select(offset, offset);
      } else {
        const offset = chip.getIndexWithinParent() + 1;
        chip.getParent()?.select(offset, offset);
      }
    }, { discrete: true });
  }

  function insert(composer, key) {
    const owner = activeComposers.get(composer);
    const input = inputFor(owner?.sessionId);
    const item = drafts.get(owner?.sessionId)?.entries.get(key);
    if (!item || input !== owner?.input || !input?.state || input.editor?.isComposing?.() ||
        !exactLiveItem(item, input, input.state.getSnapshot().attachmentIds)) return false;
    const selection = input.actions.captureInsertion();
    if (!selection) return false;
    const previousNodes = input.editor?.getEditorState?.()?._nodeMap;
    const detectText = input.projection?.detectText;
    const addedSpace = typeof detectText === 'string' && detectText.charAt(selection.end) !== ' ';
    // Attach after the selected characters, so clicking a file never deletes a
    // selected question or IME text while applying the native revision guard.
    const applied = input.insertReference({
      source: referenceSource, ref: key, label: item.label, clipboardText: '【' + item.label + '】',
    }, { ...selection, start: selection.end });
    if (applied) focusAfterReference(input, previousNodes, key, addedSpace);
    return applied;
  }

  function sourceItem(key) {
    for (const state of drafts.values()) {
      if (state.entries.has(key)) return { item: state.entries.get(key), state };
    }
  }

  function canReuseEntry(entry) {
    return Boolean(entry?.sessionId && entry.id && (
      entry.source === 'path' && entry.path && referencePath(entry.pathReference) ||
      entry.kind === 'image' && entry.attachment?.attachmentId &&
      typeof bindingFor(entry.sessionId)?.session?.readAttachment === 'function'
    ));
  }

  async function reuseEntry(original, signal) {
    if (signal?.aborted || !canReuseEntry(original)) return false;
    const sessionId = original.sessionId;
    const entry = syncSession(sessionId)?.byId.get(original.id);
    if (!canReuseEntry(entry)) return false;
    const binding = bindingFor(sessionId);
    const input = bindFileIntake(inputFor(sessionId), sessionId);
    const editor = input?.editor;
    const root = editor?.getRootElement?.();
    const composer = root?.closest('[data-composer-card]');
    const current = () => !signal?.aborted && composer?.isConnected && sessionFor(root) === sessionId &&
      bindingFor(sessionId) === binding && inputFor(sessionId) === input && editor.getRootElement() === root &&
      editor.isEditable() && !editor.isComposing() && input.state.getSnapshot().phase === 'plain';
    if (!current()) return false;
    const position = input.actions.captureInsertion();
    const applicable = () => {
      if (!current()) return false;
      const now = input.actions.captureInsertion();
      return now.draftRev === position.draftRev && now.start === position.start && now.end === position.end;
    };
    const state = syncDetachedEntries(sessionId, input);
    let item, rollback;
    if (entry.source === 'path') {
      const files = get('remote')?.workspaceFiles;
      const result = await files?.stat?.(sessionId, entry.path.replaceAll('\\', '/'), signal);
      if (!result?.ok || !applicable()) return false;
      const existing = listPaths(sessionId).find(path => path.pathReference === entry.pathReference);
      const row = existing ?? pathRecord(sessionId, newNonce(), entry.name, entry.pathReference);
      if (!row) return false;
      if (!existing) {
        if (!adoptDraftPath(composer, row)) return false;
        rollback = () => removeDraftPath(composer, row.id);
      }
      item = state.byIdentity.get('local:' + row.id);
    } else {
      const nativeId = entry.attachment.attachmentId;
      const origin = imageOrigins.forEntry(entry);
      const ids = input.state.getSnapshot().attachmentIds;
      item = [...state.entries.values()].find(candidate => candidate.reusedAttachmentId === nativeId &&
        candidate.name === entry.name && candidate.reusedImageOrigin === origin && exactLiveItem(candidate, input, ids));
      if (!item) {
        const conversation = get('conversation');
        const result = await binding.session.readAttachment(entry.attachment);
        const value = result?.ok && result.value;
        if (!value?.data?.byteLength || value.attachment?.attachmentId !== nativeId || !applicable()) return false;
        const file = new File([value.data], entry.name, { type: value.attachment.mediaType });
        imageOrigins.rememberReused(file, entry);
        const staged = conversation.createDrafts(sessionId, [file], binding.session.getSnapshot().subagent === null);
        const native = staged[0];
        if (!native || native.kind !== 'image' || !input.addAttachments([native.id])) {
          for (const draft of staged) conversation.releaseDraftAttachment(draft.id);
          return false;
        }
        item = rememberDraftEntry(state, 'upload:' + native.id, {
          kind: 'image', name: entry.name, draftAttachmentId: native.id, reusedAttachmentId: nativeId,
          reusedImageOrigin: origin,
        });
        rollback = () => {
          if (input.removeAttachment(native.id)) conversation.releaseDraftAttachment(native.id);
        };
      }
    }
    renumberDraft(state);
    activeComposers.set(composer, { sessionId, input });
    if (item && insert(composer, item.key)) return true;
    rollback?.();
    return false;
  }

  function pathsFromDraft(input) {
    return (input?.state?.getSnapshot?.()?.occurrences ?? []).filter(ref =>
      (ref.source === 'reference' || ref.source === attachmentPathSource) &&
      ref.appearance === 'file' && !ref.invalid && referencePath(ref.ref));
  }

  function sendPacket(native, session, text, ids, rest) {
    const sessionId = session?.sessionId;
    const detachedPaths = listPaths(sessionId);
    const state = detachedPaths.length ? syncDetachedEntries(sessionId, inputFor(sessionId)) :
      drafts.get(sessionId) ?? (ids?.length ? ensureDraft(sessionId, inputFor(sessionId)) : undefined);
    const suppliedTokens = [...text.matchAll(pendingToken)];
    const nativeText = () => restoreUploadPaths(text).text;
    if (!state || !Array.isArray(ids)) {
      if (!detachedPaths.length && !suppliedTokens.length) return native(session, nativeText(), ids, ...rest);
      notifyInput(sessionId, '此引用已脱离原草稿，请重新选择附件。', 'This reference belongs to another draft. Select the attachment again.');
      return Promise.resolve({ kind: 'error' });
    }
    const pathOccurrences = pathsFromDraft(state.input);
    const unmatchedPaths = pathOccurrences.map(ref => ref.ref);
    const items = [];
    const numbersByKey = new Map();
    const uploads = get('conversation')?.resolveDraftAttachments?.(ids) ?? [];
    if (uploads.length === ids.length) {
      for (const upload of uploads) {
        const name = cleanName(upload.file?.name);
        if (name) rememberDraftEntry(state, 'upload:' + upload.id, {
          kind: fileKind(name, upload.kind), name, draftAttachmentId: upload.id,
        });
      }
    }
    const sentPathIds = new Set();
    for (const entry of state.entries.values()) {
      let slot, pathReference;
      if (entry.draftAttachmentId) {
        slot = ids.indexOf(entry.draftAttachmentId);
        if (slot < 0) continue;
      } else {
        if (!exactLiveItem(entry, state.input, ids)) continue;
        if (entry.pathId) {
          sentPathIds.add(entry.pathId);
        } else {
          const index = unmatchedPaths.indexOf(entry.pathReference);
          if (index < 0) continue;
          unmatchedPaths.splice(index, 1);
        }
        pathReference = entry.pathReference;
      }
      const number = items.length + 1;
      const item = {
        number, label: makeLabel(entry.kind, number, english()), kind: entry.kind, name: entry.name,
        ...(pathReference ? { pathReference, size: entry.size } : { slot }),
      };
      items.push(item);
      numbersByKey.set(entry.key, item);
    }
    if (suppliedTokens.some(match => !numbersByKey.has(match[1])) ||
        ((suppliedTokens.length || detachedPaths.length) && (uploads.length !== ids.length ||
          sentPathIds.size !== detachedPaths.length ||
          items.filter(item => typeof item.slot === 'number').length !== ids.length))) {
      notifyInput(sessionId, '附件已发生变化，请查看草稿中的附件后重试。', 'Attachments changed. Check the current draft and try again.');
      return Promise.resolve({ kind: 'error' });
    }
    if (!items.length || uploads.length !== ids.length ||
        items.filter(item => typeof item.slot === 'number').length !== ids.length ||
        items.some(item => typeof item.slot === 'number' && uploads[item.slot]?.kind !== (item.kind === 'image' ? 'image' : 'file'))) {
      if (detachedPaths.length) {
        notifyInput(sessionId, '无法核对本次发送的附件，请检查后重试。', 'Some attachments could not be matched. Check them and try again.');
        return Promise.resolve({ kind: 'error' });
      }
      return native(session, nativeText(), ids, ...rest);
    }
    const uploadStates = get('conversation')?.fileUploads?.getSnapshot?.() ?? {};
    const modelRows = items.map(item => {
      const name = JSON.stringify(item.name);
      if (item.pathReference) return item.label + ' = 本地文件 ' + name + '，使用原生路径 ' + item.pathReference;
      const actual = uploadStates[ids[item.slot]]?.file;
      if (typeof actual?.attachmentId === 'string') item.nativeId = actual.attachmentId;
      if (item.kind === 'image') {
        const ordinal = uploads.slice(0, item.slot + 1).filter(upload => upload.kind === 'image').length;
        return item.label + ' = 本条消息真实图像输入中的第 ' + ordinal + ' 张，文件名 ' + name;
      }
      return item.label + ' = 本条消息上传附件序列的第 ' + (item.slot + 1) + ' 项，文件名 ' + name +
        (actual?.attachmentId ? '，原生文件身份 ' + actual.attachmentId : '') + '，需要内容时使用对应的原生文件句柄读取';
    });
    const linkedText = text.replace(pendingToken, (_token, key) => chipText(state.nonce, numbersByKey.get(key)));
    const restored = restoreUploadPaths(linkedText, items);
    const packet = JSON.stringify({ batch: state.nonce, items,
      ...(restored.hiddenPaths.length ? { hiddenPaths: restored.hiddenPaths } : {}) });
    if (packet.length > 50000 || items.length > 128) {
      if (!suppliedTokens.length && !detachedPaths.length) return native(session, nativeText(), ids, ...rest);
      notifyInput(sessionId, '附件对照超出单条消息范围，请分两次发送。', 'The attachment map is too large. Send the attachments in two messages.');
      return Promise.resolve({ kind: 'error' });
    }
    const wireText = restored.text.trimEnd() + manifestHeading + modelRows.join('\n') +
      '\n正文里的编号仅指上表对应项；按编号读取对应附件。\n⟦WD-A1:' + packet + '⟧';
    const remembered = imageOrigins.remember(sessionId, state.nonce, items, uploads);
    const clearSentPaths = () => {
      if (!sentPathIds.size) return;
      const current = listPaths(sessionId);
      const remaining = current.filter(row => !sentPathIds.has(row.id));
      if (remaining.length !== current.length) updatePaths(sessionId, remaining);
    };
    if (sentPathIds.size && typeof rest[2] === 'function') {
      const accept = rest[2];
      rest[2] = () => { clearSentPaths(); accept(); };
    }
    let result;
    try {
      result = native(session, wireText, ids, ...rest);
    } catch (error) {
      remembered?.discard();
      throw error;
    }
    return Promise.resolve(result).then(outcome => {
      if (outcome?.kind === 'success') {
        clearSentPaths();
        if (drafts.get(sessionId) === state) drafts.delete(sessionId);
      }
      if (outcome?.kind !== 'success') remembered?.discard();
      return outcome;
    }, error => {
      remembered?.discard();
      throw error;
    });
  }

  function openEntry(entry) {
    const binding = entry && bindingFor(entry.sessionId);
    if (!binding) return false;
    if (entry.path) {
      const original = get('inputTriggers')?.sessionOf?.(binding.ctx);
      return original?.openReference?.('reference', { ref: entry.pathReference ?? '@"' + entry.path + '"', appearance: 'file' }) === true;
    }
    if (entry.kind !== 'image') return false;
    for (const session of document.querySelectorAll('[data-conversation-session]')) {
      if (session.dataset.conversationSession !== entry.sessionId) continue;
      const mapped = [...session.querySelectorAll('[data-wd-sent-image][data-wd-sent-entry]')]
        .find(item => item.dataset.wdSentEntry === entry.id);
      const row = mapped ?? findNativeImage(entry, binding, session);
      const preview = [...(row?.querySelectorAll('button') ?? [])].find(button =>
        !button.disabled && !button.hasAttribute('data-wd-sent-number') && button.querySelector('img'));
      if (preview) { preview.click(); return true; }
    }
    return false;
  }

  function findNativeImage(entry, binding, session) {
    if (!entry.messageId || !entry.attachment?.attachmentId || !Number.isSafeInteger(entry.slot)) return;
    const nodes = get('uiConversation')?.binding?.(binding)?.target?.('chat')?.getSnapshot?.()?.nodes;
    if (typeof nodes?.get !== 'function') return;
    for (const seat of session.querySelectorAll('[data-chat-node-key]')) {
      const message = nodes.get(seat.dataset.chatNodeKey)?.data;
      if (message?.messageId !== entry.messageId) continue;
      const uploads = messageContent({ source: message.source, content: message.content })?.uploads;
      const native = uploads?.[entry.slot];
      if (native?.type !== 'image' || native.attachment.attachmentId !== entry.attachment.attachmentId) return;
      const rail = seat.querySelector('[data-message-attachments]');
      if (rail?.children.length === uploads.length) return rail.children.item(entry.slot);
    }
  }

  function showEntry(sessionId, id) {
    const entry = syncSession(sessionId)?.byId.get(id);
    if (!openEntry(entry)) notifyInput(sessionId, '该附件当前没有可用的原始预览。', 'The original preview for this attachment is unavailable.');
  }

  function highlightEntry(event) {
    const image = event.target.closest?.('[data-wd-sent-image][data-wd-sent-entry]');
    if (image && !event.target.closest('button, a')) {
      showEntry(sessionFor(image), image.dataset.wdSentEntry);
      return;
    }
    const trigger = event.target.closest?.('button[data-wd-sent-reference-id]');
    const stack = trigger?.closest('[data-wd-sent-stack]');
    const target = stack && [...stack.querySelectorAll('[data-wd-sent-entry]')]
      .find(item => item.dataset.wdSentEntry === trigger.dataset.wdSentReferenceId);
    if (!target) return;
    event.stopPropagation();
    stack.querySelector('[data-wd-reference-highlight]')?.removeAttribute('data-wd-reference-highlight');
    target.setAttribute('data-wd-reference-highlight', '');
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    (target.matches('button') ? target : target.querySelector('button[data-variant]') ?? target)
      .focus({ preventScroll: true });
  }

  function activateNumber(button, sessionId, id) {
    button.addEventListener('click', event => {
      event.stopPropagation();
      showEntry(sessionId, id);
    });
  }

  function cardDetails(item) {
    const name = item.name;
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : '';
    const description = document.createElement('span');
    description.setAttribute('data-wd-sent-card-info', '');
    const title = document.createElement('span');
    title.setAttribute('data-wd-sent-card-name', '');
    title.textContent = extension ? name.slice(0, dot) : name;
    const meta = document.createElement('span');
    meta.setAttribute('data-wd-sent-card-meta', '');
    const number = document.createElement('span');
    number.setAttribute('data-wd-sent-number', '');
    number.textContent = item.label;
    number.title = name;
    const facts = document.createElement('span');
    facts.setAttribute('data-wd-sent-card-facts', '');
    facts.textContent = [extension, formatAttachmentSize(item.size)].filter(Boolean).join(' · ');
    meta.append(number, facts);
    description.append(title, meta);
    if (item.kind === 'image') return [description];
    const glyph = document.createElement('span');
    glyph.setAttribute('data-wd-sent-glyph', '');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = item.kind === 'table' ? 'X' : /^DOC/.test(extension) ? 'W' : extension.slice(0, 3) || '≡';
    return [glyph, description];
  }

  function mountRail(rail) {
    rail.setAttribute('data-wd-sent-rail', '');
    const controls = document.createElement('div');
    controls.setAttribute('data-wd-sent-pager', '');
    controls.hidden = true;
    function arrow(direction, title) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.textContent = direction < 0 ? '‹' : '›';
      button.addEventListener('click', () => {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        rail.scrollBy({ left: Math.max(170, rail.clientWidth - 75) * direction, behavior: reduced ? 'auto' : 'smooth' });
      });
      return button;
    }
    const back = arrow(-1, copy('前面的附件', 'Previous attachments'));
    const next = arrow(1, copy('后面的附件', 'More attachments'));
    const refresh = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      controls.hidden = max <= 2;
      back.disabled = rail.scrollLeft <= 1;
      next.disabled = rail.scrollLeft >= max - 1;
    };
    rail.after(controls);
    controls.append(back, next);
    rail.addEventListener('scroll', refresh, { passive: true });
    railObserver ??= new ResizeObserver(entries => {
      for (const entry of entries) railRefresh.get(entry.target)?.();
    });
    railRefresh.set(rail, refresh);
    railObserver.observe(rail);
    return () => {
      railObserver.unobserve(rail);
      railRefresh.delete(rail);
      rail.removeAttribute('data-wd-sent-rail');
      rail.removeEventListener('scroll', refresh);
      controls.remove();
    };
  }

  function restore(stack, previous) {
    stack.removeAttribute('data-wd-sent-stack');
    previous.releaseRail?.();
    for (const button of previous.buttons) button.remove();
    for (const item of previous.uploads) {
      item.removeAttribute('data-wd-sent-upload');
      item.removeAttribute('data-wd-sent-image');
      item.removeAttribute('data-wd-sent-kind');
      item.removeAttribute('data-wd-sent-entry');
      item.removeAttribute('data-wd-reference-highlight');
      if (item.hasAttribute('data-wd-sent-tabindex')) {
        item.removeAttribute('tabindex');
        item.removeAttribute('data-wd-sent-tabindex');
      }
      item.style.removeProperty('--wd-sent-index');
    }
    if (previous.pathRail && !previous.pathRail.childElementCount) previous.pathRail.remove();
  }

  function decorate(marker) {
    const bubble = marker.closest('[data-message-bubble]');
    const stack = bubble?.parentElement;
    const sessionId = sessionFor(bubble);
    const batch = marker.getAttribute('data-wd-sent-attachment-map');
    if (!stack || !sessionId || !batch) return;
    const previous = decorations.get(stack);
    if (previous?.batch === batch && stack.contains(previous.rail) &&
        previous.buttons.every(button => stack.contains(button))) {
      previous.marker = marker;
      return;
    }
    if (previous) {
      restore(stack, previous);
      decorations.delete(stack);
    }
    const committed = syncSession(sessionId)?.byBatch.get(batch);
    if (!committed?.length) return;
    const uploads = [...(stack.querySelector(':scope > [data-message-attachments]')?.children ?? [])];
    const uploadRecords = committed.filter(item => item.attachment);
    if (uploads.length !== uploadRecords.length) return;
    stack.setAttribute('data-wd-sent-stack', '');
    const buttons = [], markedUploads = [];
    let pathRail;
    const actualRail = stack.querySelector(':scope > [data-message-attachments]');
    for (const item of committed) {
      if (item.attachment) {
        const host = uploads[item.slot];
        if (!host) continue;
        const isImage = item.kind === 'image';
        host.setAttribute('data-wd-sent-upload', '');
        host.setAttribute('data-wd-sent-kind', item.kind);
        if (isImage) host.setAttribute('data-wd-sent-image', '');
        else if (!host.hasAttribute('tabindex')) {
          host.tabIndex = -1;
          host.setAttribute('data-wd-sent-tabindex', '');
        }
        host.setAttribute('data-wd-sent-entry', item.id);
        host.style.setProperty('--wd-sent-index', String(item.number));
        const details = cardDetails(item);
        host.append(...details);
        buttons.push(...details);
        markedUploads.push(host);
      } else if (item.path) {
        const rail = actualRail ?? (pathRail ??= document.createElement('div'));
        if (!actualRail && !rail.isConnected) {
          rail.setAttribute('data-message-attachments', '');
          stack.insertBefore(rail, bubble);
        }
        const pathButton = document.createElement('button');
        pathButton.type = 'button';
        pathButton.setAttribute('data-wd-sent-path', '');
        pathButton.setAttribute('data-wd-sent-kind', item.kind);
        pathButton.setAttribute('data-wd-sent-entry', item.id);
        pathButton.style.setProperty('--wd-sent-index', String(item.number));
        pathButton.title = item.name;
        pathButton.setAttribute('aria-label', item.label + ' ' + item.name);
        pathButton.append(...cardDetails(item));
        activateNumber(pathButton, sessionId, item.id);
        rail.append(pathButton);
        buttons.push(pathButton);
      }
    }
    const rail = actualRail ?? pathRail;
    decorations.set(stack, { batch, marker, rail, buttons, uploads: markedUploads, pathRail, releaseRail: rail && mountRail(rail) });
  }

  function schedule() {
    if (disposed || frame || typeof document === 'undefined') return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const [stack, state] of decorations) if (!stack.isConnected || !stack.contains(state.marker)) {
        restore(stack, state);
        decorations.delete(stack);
      }
      for (const marker of document.querySelectorAll('[data-wd-sent-attachment-map]')) decorate(marker);
    });
  }

  function install() {
    const conversation = get('conversation');
    const triggers = get('inputTriggers');
    const ui = get('uiConversation');
    const slots = get('slots') ?? ctx.slots;
    if (typeof conversation?.sendSession !== 'function' || !triggers?.registerSource) return;
    // 插件可能被宿主重复加载；只允许一个实例包裹发送与渲染，否则同一条
    // 消息会追加多份附件对照。
    const scope = typeof window === 'object' && window ? window : globalThis;
    if (scope[installMarker]) return;
    scope[installMarker] = true;
    disposers.push(() => {
      try { if (scope[installMarker] === true) delete scope[installMarker]; } catch {}
    });
    const previous = conversation.sendSession;
    const wrapped = function(session, text, ids, ...rest) {
      return sendPacket((...args) => previous.apply(this, args), session, text, ids, rest);
    };
    conversation.sendSession = wrapped;
    disposers.push(() => { if (conversation.sendSession === wrapped) conversation.sendSession = previous; });
    const resolver = conversation.input;
    if (typeof resolver?.sink === 'function') {
      const nativeSink = resolver.sink;
      const wrapSink = function(session, text, ids, mode, signal, accept) {
        if (text === '' && Array.isArray(ids) && !ids.length && listPaths(session?.sessionId).length) {
          return conversation.sendSession(session, text, ids, mode, signal, accept);
        }
        return nativeSink.call(this, session, text, ids, mode, signal, accept);
      };
      try {
        resolver.sink = wrapSink;
        detachedIntake = resolver.sink === wrapSink;
      } catch {}
      disposers.push(() => { if (resolver.sink === wrapSink) resolver.sink = nativeSink; });
    }
    if (typeof resolver?.shell === 'function') {
      const original = resolver.shell;
      const wrapShell = function(sessionId, ...args) { return bindFileIntake(original.call(this, sessionId, ...args), sessionId); };
      resolver.shell = wrapShell;
      disposers.push(() => { if (resolver.shell === wrapShell) resolver.shell = original; });
    }
    disposers.push(triggers.registerSource({
      trigger: '@', name: attachmentPathSource, showGroupTitle: false,
      candidates: () => Promise.resolve([]), onPick: () => undefined,
      openReference(session, { ref }) {
        return openEntry({ sessionId: session.sessionId, path: referencePath(ref), pathReference: ref });
      },
      codec: {
        clipboardText: ref => ref,
        async serialize(ref) { return '⟦WD-UPL:' + uploadMarker + ':' + encodeURIComponent(ref) + '⟧'; },
      },
    }));
    disposers.push(triggers.registerSource({
      trigger: '@', name: referenceSource, showGroupTitle: false,
      candidates: () => Promise.resolve([]), onPick: () => undefined,
      openReference(session, { ref }) {
        const found = sourceItem(ref);
        return found?.item.pathReference && openEntry({
          sessionId: session.sessionId, path: referencePath(found.item.pathReference), pathReference: found.item.pathReference,
        }) || false;
      },
      codec: {
        clipboardText: key => {
          const found = sourceItem(key);
          return found ? '【' + found.item.label + '】' : '';
        },
        async serialize(key) {
          // The send wrapper checks this ID against the frozen submission. The
          // composer rail for a carried draft may not have rendered yet.
          if (typeof key === 'string' && key.endsWith(':0') && nativeDraftIdPattern.test(key.slice(0, -2))) {
            return '⟦WD-REF:' + key + '⟧';
          }
          const found = sourceItem(key);
          if (!found || !exactLiveItem(found.item, found.state.input, found.state.input.state.getSnapshot().attachmentIds)) {
            throw new Error(copy('引用的附件已经移除，请检查草稿。', 'A referenced attachment was removed. Check the draft.'));
          }
          return '⟦WD-REF:' + key + '⟧';
        },
      },
    }));
    if (!ui?.userText?.register || !slots || !jsx) return;
    disposers.push(ui.userText.register({
      id: uploadPathNodeId, order: -102,
      match(text, from) {
        const path = cachedPacket(text)?.hiddenPaths?.find(item => item.start >= from);
        if (path) return { id: uploadPathNodeId, start: path.start, end: path.end, data: {} };
      },
    }));
    disposers.push(ui.userText.register({
      id: packetNodeId, order: -100,
      match(text, from) {
        const packet = cachedPacket(text);
        if (!packet || from > packet.start) return;
        return { id: packetNodeId, start: packet.start, end: text.length, data: { batch: packet.batch } };
      },
    }));
    disposers.push(ui.userText.register({
      id: textNodeId, order: -101,
      match(text, from) {
        const packet = cachedPacket(text);
        if (!packet || from >= packet.start) return;
        let best;
        for (const item of packet.items) {
          const token = chipText(packet.batch, item);
          const start = text.indexOf(token, from);
          if (start < 0 || start >= packet.start || best && best.start <= start) continue;
          best = { id: textNodeId, start, end: start + token.length, data: { id: rowId(packet.batch, item), label: item.label, name: item.name } };
        }
        return best;
      },
    }));
    disposers.push(slots.inject('conversation.user.text.node', function* () {
      yield slots.register({ name: 'conversation.user.text.node', key: uploadPathNodeId, priority: 90 },
        () => jsx('span', { hidden: true }));
      yield slots.register({ name: 'conversation.user.text.node', key: packetNodeId, priority: 90 },
        ({ node }) => jsx('span', { hidden: true, 'data-wd-sent-attachment-map': node.data.batch }));
      yield slots.register({ name: 'conversation.user.text.node', key: textNodeId, priority: 90 }, ({ node, interactive }) => {
        const props = { 'data-wd-sent-reference': '', title: node.data.name, children: node.data.label };
        return interactive ? jsx('button', { ...props, type: 'button', 'data-wd-sent-reference-id': node.data.id }) : jsx('span', props);
      });
    }));
    document.addEventListener('click', highlightEntry, true);
    disposers.push(() => document.removeEventListener('click', highlightEntry, true));
    const style = document.createElement('style');
    style.textContent = sentStyles;
    document.head.append(style);
    disposers.push(() => style.remove());
    const observer = new MutationObserver(records => {
      if (records.some(record => record.target.matches?.('[data-wd-sent-rail]') ||
        [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches('[data-message-attachments],[data-wd-sent-attachment-map]') ||
          node.querySelector('[data-message-attachments],[data-wd-sent-attachment-map]'))))) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    disposers.push(() => observer.disconnect());
    schedule();
  }

  install();
  return {
    trackComposer, releaseComposer, insert,
    listDraftPaths, listDraftPathsForSession, removeDraftPath, removeDraftPathForSession,
    adoptDraftPath, openDraftPath, hasOnlyDraftPaths, submitOnlyPaths,
    subscribeDraftChanges(listener) { draftListeners.add(listener); return () => draftListeners.delete(listener); },
    listSession: id => syncSession(id)?.entries ?? [],
    localImageOrigin: imageOrigins.forEntry,
    canReuseEntry, reuseEntry,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    openEntry,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      for (const drop of disposers.reverse()) if (typeof drop === 'function') drop();
      for (const state of sessions.values()) state.off?.();
      for (const record of fileIntakes.values()) record.restore();
      for (const [stack, state] of decorations) restore(stack, state);
      railObserver?.disconnect();
      sessions.clear();
      listeners.clear();
      imageOrigins.dispose();
      drafts.clear();
      draftPaths.clear();
      draftListeners.clear();
      fileIntakes.clear();
      decorations.clear();
      textCache.clear();
    },
  };
}
