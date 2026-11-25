const keyPrefix = "whale-dream:local-image-origin:";
const maxPending = 64;
const maxRecent = 256;

function isIdentity(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isSlot(value) {
  return Number.isSafeInteger(value) && value >= 0 && value < 128;
}

function absolutePath(value) {
  return typeof value === "string" && value.length <= 4096 && value.isWellFormed() &&
    !/[\u0000-\u001f\u007f]/u.test(value) && (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\"));
}

function originalFilePath(file, lookup) {
  if (!file || typeof file.name !== "string" || file.name.length === 0) return;
  try {
    const path = lookup(file);
    if (!absolutePath(path)) return;
    const windows = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
    const leaf = path.split(windows ? /[\\/]/ : "/").at(-1);
    if (!leaf || leaf.normalize("NFC") !== file.name.normalize("NFC")) return;
    return path;
  } catch { /* Clipboard, browser-only, or inaccessible file path. */ }
}

function originKey(entry) {
  const { sessionId, messageId, slot, attachment } = entry ?? {};
  if (entry?.kind !== "image" || entry.source !== "upload" || !isIdentity(sessionId) || !isIdentity(messageId) ||
      !isSlot(slot) || !isIdentity(attachment?.attachmentId)) return;
  // The native durable attachment identity and the message slot both matter:
  // the same bytes can be attached twice from different physical locations.
  return keyPrefix + JSON.stringify([sessionId, messageId, slot, attachment.attachmentId]);
}

export function createImageOrigins({
  lookup = file => window.__DSH_HOST_PATHS__?.pathFor?.(file),
  storage = () => window.localStorage,
} = {}) {
  const pending = new Map();
  const recent = new Map();
  const reused = new WeakMap();
  const submissionKey = (sessionId, batch) => JSON.stringify([sessionId, batch]);

  function remember(sessionId, batch, items, uploads) {
    if (!isIdentity(sessionId) || !isIdentity(batch)) return;
    const candidates = new Map();
    for (const item of items) {
      if (item.kind !== "image" || !isSlot(item.slot)) continue;
      const draft = uploads[item.slot];
      if (draft?.kind !== "image") continue;
      const path = originalFilePath(draft.file, lookup);
      const carried = reused.get(draft.file);
      if (path) candidates.set(item.slot, { name: item.name, path });
      else if (carried?.sessionId === sessionId) candidates.set(item.slot, { name: item.name, ...carried });
    }
    if (candidates.size === 0) return;
    const key = submissionKey(sessionId, batch);
    pending.delete(key);
    pending.set(key, candidates);
    while (pending.size > maxPending) pending.delete(pending.keys().next().value);
    return { discard: () => { if (pending.get(key) === candidates) pending.delete(key); } };
  }

  function admit(sessionId, rows) {
    const batch = rows[0]?.batch;
    if (!isIdentity(batch)) return;
    const pendingKey = submissionKey(sessionId, batch);
    const candidates = pending.get(pendingKey);
    if (!candidates) return;

    const matched = new Map();
    for (const row of rows) {
      const candidate = candidates.get(row.slot);
      const key = row.sessionId === sessionId && row.batch === batch ? originKey(row) : undefined;
      if (!key || candidate?.name !== row.name ||
          candidate.attachmentId && candidate.attachmentId !== row.attachment.attachmentId) continue;
      if (matched.has(row.slot)) return;
      matched.set(row.slot, { key, path: candidate.path });
    }
    // An accepted packet is redeemed once, after the real event supplies all
    // expected native attachment identities. A copied packet cannot rebind it.
    if (matched.size !== candidates.size) return;
    pending.delete(pendingKey);
    for (const { key, path } of matched.values()) {
      recent.set(key, path);
      while (recent.size > maxRecent) recent.delete(recent.keys().next().value);
      try { storage()?.setItem(key, path); } catch { /* Available for this window only. */ }
    }
  }

  function forEntry(entry) {
    const key = originKey(entry);
    if (!key) return;
    const cached = recent.get(key);
    if (cached) return cached;
    try {
      const path = storage()?.getItem(key);
      return absolutePath(path) ? path : undefined;
    } catch { /* Browser storage may be disabled. */ }
  }

  function rememberReused(file, entry) {
    const path = forEntry(entry);
    if (path) reused.set(file, { path, sessionId: entry.sessionId, attachmentId: entry.attachment.attachmentId });
  }

  return { remember, admit, forEntry, rememberReused, dispose() { pending.clear(); recent.clear(); } };
}
