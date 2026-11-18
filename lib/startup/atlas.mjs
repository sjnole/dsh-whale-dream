/** Locate the official DSH PixelWhale atlas already installed alongside Harness.
 * This plugin deliberately does not replace the official 137-frame artwork.
 * On Desktop the bootstrap is inlined into dsh-app://, so it must carry a data
 * URL rather than depend on a Host HTTP route that Desktop cannot reach.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute, parse, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const PKG = '@deepseek-ai/dsh-client-ui-brand-official';
const MAX_BYTES = 512 * 1024;
let cache;

function isWebp(buffer) {
  return buffer.length > 100 && buffer.length <= MAX_BYTES &&
    buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}
function readAtlas(path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > MAX_BYTES || stat.size < 100) return null;
    const bytes = readFileSync(path);
    return isWebp(bytes) ? bytes : null;
  } catch { return null; }
}
function scanDirectory(dir) {
  try {
    for (const name of readdirSync(dir)) {
      if (/^breach-atlas(?:-[\da-f]{12})?\.webp$/i.test(name)) {
        const bytes = readAtlas(join(dir, name));
        if (bytes) return bytes;
      }
    }
  } catch { /* A different package layout; keep looking. */ }
  return null;
}
function roots() {
  const initial = [here, process.cwd(), dirname(process.execPath)];
  if (process.argv[1]) initial.push(dirname(resolve(process.argv[1])));
  if (process.env.DSH_HOME) initial.push(resolve(process.env.DSH_HOME));
  if (process.env.NODE_PATH) initial.push(...process.env.NODE_PATH.split(delimiter));
  const seen = new Set();
  const out = [];
  for (const base of initial) {
    let path = resolve(base);
    for (let depth = 0; depth < 9 && !seen.has(path); depth++) {
      seen.add(path);
      out.push(path);
      const parent = dirname(path);
      if (parent === path || path === parse(path).root) break;
      path = parent;
    }
  }
  for (const base of initial) {
    try {
      const requireFrom = createRequire(join(resolve(base), '__whale_resolver__.cjs'));
      const filename = requireFrom.resolve(`${PKG}/package.json`);
      out.unshift(dirname(filename));
    } catch { /* Not exported or not in this resolver's module graph. */ }
  }
  return [...new Set(out)];
}
/** Override with DSH_WHALE_ATLAS=/absolute/path/.../breach-atlas.webp if needed. */
export function readOfficialWhaleAtlas() {
  const explicit = process.env.DSH_WHALE_ATLAS;
  if (explicit && isAbsolute(explicit)) {
    const file = readAtlas(explicit);
    if (file) return file;
  }
  if (cache !== undefined) return cache;
  for (const root of roots()) {
    const dirs = [
      join(root, 'src', 'client', 'assets'),
      join(root, 'lib', 'assets'),
      join(root, 'assets'),
      join(root, 'packages', 'client', 'ui-brand-official', 'src', 'client', 'assets'),
      join(root, 'node_modules', PKG, 'src', 'client', 'assets'),
      join(root, 'node_modules', PKG, 'lib', 'assets'),
      join(root, 'node_modules', PKG, 'assets'),
      join(root, 'plugins', PKG, 'assets'),
      join(root, 'dist', 'plugins', PKG, 'assets'),
    ];
    for (const dir of dirs) {
      const found = scanDirectory(dir);
      if (found) return (cache = found);
    }
  }
  return (cache = null);
}
export function officialWhaleAtlasDataUrl() {
  const bytes = readOfficialWhaleAtlas();
  return bytes ? `data:image/webp;base64,${bytes.toString('base64')}` : '';
}
