import { execFile, spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { canOpenFileInBrowser } from './file-history-browser-formats.js';

const run = promisify(execFile);
const route = '/api/whale-dream.history-browser';
const packetTail = /\n⟦WD-A1:(\{[^\r\n]{1,50000}\})⟧$/u;
const packetHeading = '\n\n附件对照（仅本条消息）：\n';
const batchId = /^[0-9a-f-]{36}$/u;
const windowsBrowserQuery = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WhaleBrowserAssociation {
  [DllImport("Shlwapi.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
  static extern int AssocQueryStringW(uint flags, uint type, string scheme, string verb, StringBuilder value, ref uint size);

  public static string Find() {
    uint size = 32768;
    var output = new StringBuilder((int)size);
    // ASSOCF_IS_PROTOCOL and ASSOCSTR_EXECUTABLE resolve the current user's HTTPS application.
    return AssocQueryStringW(0x1000, 2, "https", null, output, ref size) == 0 ? output.ToString() : "";
  }
}
'@
[WhaleBrowserAssociation]::Find()
`;
const macBrowserQuery = `
ObjC.import('AppKit');
const url = $.NSURL.URLWithString('https://localhost/');
const app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(url);
ObjC.unwrap(app.path);
`;

async function defaultBrowser(signal) {
  let browser;
  const options = { signal, timeout: 8000, windowsHide: true, encoding: 'utf8' };
  if (process.platform === 'win32' && process.env.SystemRoot) {
    const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const encoded = Buffer.from(windowsBrowserQuery, 'utf16le').toString('base64');
    const { stdout } = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], options);
    browser = stdout.trim();
    if (!isAbsolute(browser) || extname(browser).toLowerCase() !== '.exe' || !(await stat(browser)).isFile()) return null;
  } else if (process.platform === 'darwin') {
    const { stdout } = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', macBrowserQuery], options);
    browser = stdout.trim();
    if (!isAbsolute(browser) || extname(browser).toLowerCase() !== '.app' || !(await stat(browser)).isDirectory()) return null;
  }
  return browser ?? null;
}

function launchBrowser(browser, path, signal) {
  signal.throwIfAborted();
  const url = pathToFileURL(path).href;
  const mac = process.platform === 'darwin';
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(?:PATH|USERPROFILE|APPDATA|LOCALAPPDATA|SYSTEMROOT|SYSTEMDRIVE|WINDIR|PROGRAMFILES(?:\(X86\))?|PROGRAMW6432|PROGRAMDATA|COMMONPROGRAMFILES(?:\(X86\))?|TEMP|TMP|HOMEDRIVE|HOMEPATH|USERNAME|HOME|LANG|LOGNAME|USER|TMPDIR)$/i.test(name)));
  return new Promise((resolve, reject) => {
    const child = spawn(mac ? '/usr/bin/open' : browser, mac ? ['-a', browser, url] : [url], {
      detached: !mac, stdio: 'ignore', windowsHide: false, env,
    });
    child.once('error', reject);
    if (mac) child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser launch failed')));
    else child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function sourceFile(message, batch, number) {
  if (typeof batch !== 'string' || !batchId.test(batch) || !Number.isSafeInteger(number) || number < 1 ||
      number > 10000 || message?.source?.kind !== 'user' || !Array.isArray(message.content)) return;
  const text = message.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('');
  const match = packetTail.exec(text);
  if (!match || text.lastIndexOf(packetHeading, match.index) < 0) return;
  const packet = JSON.parse(match[1]);
  if (packet?.batch !== batch || !Array.isArray(packet.items) || packet.items.length > 128) return;
  const matching = packet.items.filter(item => item?.number === number);
  const ref = matching.length === 1 && matching[0].slot === undefined && matching[0].pathReference;
  if (typeof ref !== 'string' || !ref.startsWith('@') || !text.slice(0, match.index).includes(ref)) return;
  return ref.startsWith('@"') && ref.endsWith('"') ? ref.slice(2, -1) : ref.slice(1);
}

function isLocalFilePath(path) {
  if (!canOpenFileInBrowser(path) || path.length > 4096 || /[\p{Cc}\p{Cf}]/u.test(path) || /^[\\/]{2}/.test(path)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return false;
  return process.platform !== 'win32' || !path.replace(/^[a-z]:/i, '').includes(':');
}

function sameNativePath(left, right) {
  return process.platform === 'win32' ? left.replaceAll('\\', '/').toLowerCase() === right.replaceAll('\\', '/').toLowerCase() : left === right;
}

async function hasHostMapping(fs, path, signal) {
  const mapped = fs.processPathFromHostPath(path);
  return mapped !== undefined && sameNativePath(fs.processPath(await fs.resolve(mapped, { signal })), path);
}

export function registerFileHistoryBrowser(ctx) {
  ctx.inject(['connection', 'sessionController', 'sessionQuery', 'workspaceFiles', 'sandboxPolicy', 'fs'], scope => {
    if (typeof scope.connection.fetch?.register !== 'function' ||
        typeof scope.sessionController.workspaceDesktop !== 'function') return;
    const lifetime = new AbortController();
    let saved;
    let pending;
    async function browser() {
      if (!scope.sessionController.workspaceDesktop().available) return null;
      if (saved && Date.now() < saved.expires) return saved.value;
      pending ??= defaultBrowser(lifetime.signal).catch(() => null).then(value => {
        saved = { value, expires: Date.now() + (value ? 60000 : 10000) };
        return value;
      }).finally(() => { pending = undefined; });
      return pending;
    }
    scope.effect(() => () => lifetime.abort());
    scope.connection.fetch.register({
      path: route, methods: ['GET', 'POST'], requestBody: 'buffered',
      fetch: async request => {
        const headers = { 'cache-control': 'no-store' };
        if (request.method === 'GET') {
          const app = await browser();
          return Response.json({ available: Boolean(app), ...(app ? { id: basename(app).toLowerCase() } : {}) }, { headers });
        }
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          return new Response(null, { status: 415, headers });
        }
        const signal = AbortSignal.any([request.signal, lifetime.signal]);
        try {
          const wire = await request.text();
          if (wire.length > 8192) return new Response(null, { status: 413, headers });
          const { sessionId, seq, index, batch, number } = JSON.parse(wire) ?? {};
          if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 160 ||
              !Number.isSafeInteger(seq) || seq < 0) return new Response(null, { status: 400, headers });
          const { target, session } = await scope.sessionQuery.readEvent({ sessionId, seq, before: 0, after: 0 }, signal);
          const file = target.type === 'deliverables/presented' && Number.isSafeInteger(index) && index >= 0 &&
            Array.isArray(target.data?.files) ? target.data.files[index]?.path :
            target.type === 'user/message' ? sourceFile(target.data, batch, number) : undefined;
          if (!isLocalFilePath(file)) return new Response(null, { status: 415, headers });
          const workspace = { sessionId, workspaceRoot: session.cwd ?? scope.sandboxPolicy.workspaceRoot };
          const { absolutePath: path } = await scope.workspaceFiles.stat(workspace, file, signal);
          // Match DSH's local path verification before consulting the desktop OS.
          if (!isLocalFilePath(path) || !isAbsolute(path) || !await hasHostMapping(scope.fs, path, signal)) {
            return new Response(null, { status: 422, headers });
          }
          const physical = await realpath(path);
          if (!isLocalFilePath(physical)) return new Response(null, { status: 422, headers });
          if (!sameNativePath(physical, path)) {
            // Re-authorize alias targets, including macOS /var → /private/var, through the Session.
            const resolved = await scope.workspaceFiles.stat(workspace, physical, signal);
            if (!sameNativePath(resolved.absolutePath, physical) || !await hasHostMapping(scope.fs, physical, signal)) {
              return new Response(null, { status: 422, headers });
            }
          }
          const app = await browser();
          if (!app) return new Response(null, { status: 409, headers });
          await launchBrowser(app, physical, signal);
          return new Response(null, { status: 204, headers });
        } catch {
          return new Response(null, { status: 422, headers });
        }
      },
    });
  });
}
