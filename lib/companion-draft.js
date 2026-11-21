import { randomUUID } from 'node:crypto';
import { lstat, open, unlink } from 'node:fs/promises';
import { win32 } from 'node:path';
import { pipeline } from 'node:stream/promises';

const textLimit = 4000;
const attachmentsLimit = 12;
const batchLimit = 8;
const actions = new Set(['text', 'add', 'remove', 'submit']);
const fileStates = new Set(['uploading', 'ready', 'error']);
const idPattern = /^[a-zA-Z0-9:_-]{1,140}$/;
const which = value => typeof value === 'string' && idPattern.test(value);

function windowsFile(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^[a-z]:[\\/]/i.test(value) ||
      /[\x00-\x1f\x7f<>":|?*]/u.test(value.slice(2))) return undefined;
  const path = win32.normalize(value);
  if (path.slice(3).split('\\').some(part => !part || /[. ]$/.test(part) ||
      /^(?:aux|con|nul|prn|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part))) return undefined;
  return path;
}

function readDraft(value, expected) {
  if (!value || value.id !== expected || !which(value.revision) || typeof value.text !== 'string' ||
      value.text.length > textLimit || !Array.isArray(value.attachments) || value.attachments.length > attachmentsLimit) return null;
  const attachments = [];
  const seen = new Set();
  for (const item of value.attachments) {
    if (!item || !which(item.id) || seen.has(item.id) || typeof item.name !== 'string' || item.name.length < 1 ||
        item.name.length > 180 || !['file', 'image'].includes(item.kind) || !fileStates.has(item.status)) return null;
    seen.add(item.id);
    attachments.push({
      id: item.id, name: item.name.toWellFormed(), kind: item.kind, status: item.status,
      ...(Number.isSafeInteger(item.size) && item.size >= 0 ? { size: item.size } : {}),
    });
  }
  return {
    id: expected, revision: value.revision, text: value.text.toWellFormed(), editable: value.editable === true, attachments,
  };
}

export function createCompanionDrafts({ nativeData, deliver, changed, allowed }) {
  const pasteDir = win32.join(nativeData, 'pastes').toLowerCase();
  let owner = '';
  let session = '';
  let lease = '';
  let state;
  let stateSequence = 0;
  let pending;
  const tokens = new Map();

  function stagedPath(value, pid) {
    const path = windowsFile(value);
    return path && win32.dirname(path).toLowerCase() === pasteDir &&
      new RegExp('^whale-paste-' + pid + '-[0-9]+\\.png$', 'i').test(win32.basename(path)) ? path : undefined;
  }

  function removePaste(path) {
    if (path) void unlink(path).catch(() => {});
  }

  function snapshot(id) {
    return session === id && allowed(id) ? state : undefined;
  }

  function answer(current, id, requestId, ok, error = '') {
    if (!current.stopping && current.ready && !current.proc.stdin.destroyed) {
      current.proc.stdin.write(JSON.stringify({
        type: 'draft-result', id, requestId, ok, error, draft: snapshot(id),
      }) + '\n');
    }
  }

  function finish(request, ok, error = '') {
    if (pending !== request) return;
    pending = undefined;
    clearTimeout(request.timeout);
    request.transfer.abort();
    for (const key of request.keys) tokens.delete(key);
    removePaste(request.paste);
    answer(request.current, request.id, request.requestId, ok, error);
  }

  function watch(id, client) {
    if (session === id && owner === client) return;
    if (owner) deliver(owner, { type: 'watch-draft', id: '' });
    if (pending) finish(pending, false, '会话已切换，请重新操作。');
    session = id;
    owner = client;
    lease = owner && session ? randomUUID() : '';
    state = undefined;
    stateSequence = 0;
    if (lease) deliver(owner, { type: 'watch-draft', id: session, lease });
  }

  function reconnect(client) {
    if (lease && client === owner) deliver(owner, { type: 'watch-draft', id: session, lease });
  }

  function disconnect(client) {
    if (client !== owner) return;
    watch('', '');
    changed();
  }

  function publish(client, id, proof, draft) {
    if (!id || client !== owner || id !== session || proof !== lease || !allowed(id)) return false;
    if (!Number.isSafeInteger(draft?.sequence) || draft.sequence <= 0) return false;
    const value = readDraft(draft, id);
    if (value === null) return false;
    if (draft.sequence <= stateSequence) return true;
    stateSequence = draft.sequence;
    state = value;
    changed();
    return true;
  }

  function command(current, message) {
    const { id, action, requestId, revision, attachmentId } = message;
    const paths = Array.isArray(message.paths) ? message.paths : [];
    const paste = action === 'add' && message.stagedImage === true && paths.length === 1
      ? stagedPath(paths[0], current.proc.pid) : undefined;
    const fail = error => {
      removePaste(paste);
      answer(current, id, requestId, false, error);
    };
    if (!actions.has(action) || !owner || id !== session || !allowed(id) || !state || pending) {
      fail('草稿暂不可用或正在更新，请重试。');
      return;
    }
    if (!state.editable || !which(revision) || revision !== state.revision ||
        (message.text !== undefined && (typeof message.text !== 'string' || message.text.length > textLimit))) {
      fail('草稿已更新或需在主界面处理。');
      return;
    }
    if (action === 'text' && typeof message.text !== 'string' ||
        action === 'remove' && !state.attachments.some(item => item.id === attachmentId)) {
      fail('这项草稿操作已失效。');
      return;
    }
    const files = action === 'add' && paths.length <= batchLimit ? paths.map(windowsFile) : [];
    if (action === 'add' && (!files.length || files.some(path => !path) || state.attachments.length + files.length > attachmentsLimit)) {
      fail('请选择文件，附件数量最多为 12 个。');
      return;
    }
    const deliveryId = randomUUID();
    const request = {
      current, id, requestId, client: owner, deliveryId, paste, keys: [], transfer: new AbortController(),
      timeout: setTimeout(() => finish(request, false, '操作未确认，请查看 DSH 草稿。'), 25000),
    };
    request.timeout.unref?.();
    pending = request;
    const transfers = files.map(path => {
      const key = randomUUID();
      request.keys.push(key);
      tokens.set(key, { request, path });
      return { key, name: path === paste ? '剪贴板图片.png' : win32.basename(path).toWellFormed().slice(0, 180) };
    });
    if (!deliver(owner, {
      type: 'draft', id, requestId: deliveryId, lease, action, revision, text: message.text, attachmentId, files: transfers,
    })) finish(request, false, '请打开 DSH 主界面后重试。');
  }

  async function streamFile(client, key, res, reply) {
    const item = tokens.get(key);
    if (!item || item.request !== pending || item.request.client !== client || client !== owner || !allowed(item.request.id)) {
      reply(404, { ok: false });
      return;
    }
    const { request, path } = item;
    tokens.delete(key);
    const signal = request.transfer.signal;
    const stopBeforeStreaming = () => {
      if (!res.headersSent && !res.destroyed) reply(409, { ok: false });
    };
    signal.addEventListener('abort', stopBeforeStreaming, { once: true });
    let file;
    try {
      const selected = await lstat(path);
      if (signal.aborted) return;
      if (!selected.isFile()) throw new Error('File unavailable');
      file = await open(path, 'r');
      const stat = await file.stat();
      if (signal.aborted) return;
      if (!stat.isFile() || stat.ino !== selected.ino || stat.dev !== selected.dev || !Number.isSafeInteger(stat.size)) {
        throw new Error('File unavailable');
      }
      if (pending !== request || owner !== client || !allowed(request.id)) {
        reply(409, { ok: false });
        return;
      }
      request.timeout.refresh();
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream', 'Content-Length': stat.size,
        'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff',
      });
      if (stat.size === 0) res.end();
      else {
        const source = file.createReadStream({ start: 0, end: stat.size - 1, autoClose: false });
        source.on('data', () => {
          if (pending === request) request.timeout.refresh();
        });
        await pipeline(source, res, { signal });
      }
    } catch {
      if (!signal.aborted) {
        if (!res.headersSent) reply(404, { ok: false });
        else res.destroy();
      }
    } finally {
      signal.removeEventListener('abort', stopBeforeStreaming);
      await file?.close().catch(() => {});
      if (pending !== request && request.paste === path) removePaste(path);
    }
  }

  function result(client, payload) {
    const request = pending;
    if (!request || client !== request.client || payload.lease !== lease || request.deliveryId !== payload.requestId ||
        request.id !== payload.id || typeof payload.ok !== 'boolean') return false;
    if (payload.draft) publish(client, payload.id, payload.lease, payload.draft);
    finish(request, payload.ok, typeof payload.error === 'string' ? payload.error.slice(0, 140) : '');
    return true;
  }

  return { watch, reconnect, disconnect, snapshot, publish, command, streamFile, result };
}
