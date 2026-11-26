/** Versioned profile media delivery. Call only after the host's origin fence. */
import { readFileSync, constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const PREFIX = '/whale-dream/api/profile/';
const HERE = dirname(fileURLToPath(import.meta.url));
const MIME = new Map([
  ['.webm', 'video/webm'], ['.mp4', 'video/mp4'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.json', 'application/json'],
]);
const CACHE = 'public, max-age=31536000, immutable';

function fail(res, status, headers = {}) {
  res.writeHead(status, {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin', ...headers,
  });
  res.end();
}

function matchesNoneMatch(value, etag) {
  return typeof value === 'string' && value.split(',').some(item => {
    const tag = item.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}

function permitsRange(value, etag, modified) {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  if (value.startsWith('"') || value.startsWith('W/')) return value === etag;
  const date = Date.parse(value);
  return Number.isFinite(date) && Math.floor(modified / 1000) * 1000 <= date;
}

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start = 0, end = size - 1;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : end;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * root is the profile directory containing catalog.json and assets/<id>/.
 * Catalog is loaded/validated once; request paths can only select this map.
 * Returns true when the profile prefix was handled, otherwise false.
 */
export function createProfileAssetHandler({ root = HERE, catalog } = {}) {
  const profileRoot = resolve(root);
  const source = catalog ?? JSON.parse(readFileSync(join(profileRoot, 'catalog.json'), 'utf8'));
  if (source?.schemaVersion !== 1 || typeof source.version !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(source.version) ||
      !Array.isArray(source.themes) || !source.themes.length || source.themes.length > 256) {
    throw new Error('Invalid Whale Dream profile catalog');
  }
  const revision = source.version;
  const allowed = new Map();
  const themeIds = new Set();
  for (const theme of source.themes) {
    if (typeof theme?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(theme.id) ||
        theme.id.length > 80 || themeIds.has(theme.id) ||
        !theme.files || typeof theme.files !== 'object' || Array.isArray(theme.files)) {
      throw new Error('Invalid Whale Dream profile theme');
    }
    themeIds.add(theme.id);
    for (const [filename, file] of Object.entries(theme.files)) {
      const mime = MIME.get(extname(filename));
      if (!/^[a-z0-9][a-z0-9._-]{0,100}$/.test(filename) || filename.includes('..') ||
          !mime || !file || file.mime !== mime || !Number.isSafeInteger(file.bytes) ||
          file.bytes <= 0 || file.bytes > 256 * 1024 * 1024 ||
          typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw new Error('Invalid Whale Dream profile asset');
      }
      const key = `${revision}/${theme.id}/${filename}`;
      allowed.set(key, Object.freeze({
        path: join(profileRoot, 'assets', theme.id, filename),
        bytes: file.bytes, mime, etag: `"${file.sha256}"`,
      }));
    }
  }
  if (!allowed.size) throw new Error('Empty Whale Dream profile catalog');

  async function handleProfileAsset(req, res, url) {
    const pathname = url?.pathname ?? new URL(req.url || '/', 'http://localhost').pathname;
    if (!pathname.startsWith(PREFIX)) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fail(res, 405, { allow: 'GET, HEAD' }); return true;
    }
    // Encoded path separators, traversal and extra segments are never decoded.
    // Only literal keys produced from the installed manifest can be served.
    const relative = pathname.slice(PREFIX.length);
    const asset = allowed.get(relative);
    if (!asset) { fail(res, 404); return true; }
    let file;
    try {
      file = await open(asset.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== asset.bytes) {
        await file.close(); file = undefined; fail(res, 404); return true;
      }
      const headers = {
        'cache-control': CACHE, 'content-type': asset.mime, 'etag': asset.etag,
        'last-modified': stat.mtime.toUTCString(), 'accept-ranges': 'bytes',
        'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
        'content-disposition': 'inline',
      };
      if (matchesNoneMatch(req.headers['if-none-match'], asset.etag)) {
        await file.close(); file = undefined; res.writeHead(304, headers); res.end(); return true;
      }
      let start = 0, end = stat.size - 1, status = 200;
      if (typeof req.headers.range === 'string' && permitsRange(req.headers['if-range'], asset.etag, stat.mtimeMs)) {
        const range = byteRange(req.headers.range, stat.size);
        if (!range) {
          await file.close(); file = undefined;
          fail(res, 416, { ...headers, 'cache-control': 'no-store', 'content-range': `bytes */${stat.size}` });
          return true;
        }
        ({ start, end } = range); status = 206;
        headers['content-range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['content-length'] = String(end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD') {
        await file.close(); file = undefined; res.end(); return true;
      }
      const stream = file.createReadStream({ start, end, autoClose: true });
      file = undefined;
      await pipeline(stream, res);
    } catch (error) {
      if (file) await file.close().catch(() => {});
      if (!res.headersSent && !res.destroyed) fail(res, 404);
      else if (!res.destroyed) res.destroy();
    }
    return true;
  }
  Object.defineProperties(handleProfileAsset, {
    version: { value: revision, enumerable: true },
    assetCount: { value: allowed.size, enumerable: true },
    themeCount: { value: themeIds.size, enumerable: true },
  });
  return handleProfileAsset;
}
