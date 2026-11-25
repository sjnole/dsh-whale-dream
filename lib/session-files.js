import { createElement as h, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { IconFolderOpenOutlineRegular, IconRightUpOutlineRegular, Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import { canOpenFileInBrowser } from "./file-history-browser-formats.js";

const TAB = "whale-session-files";
const PROVIDER = "dsh-whale-dream.session-files";
const browserEndpoint = "api/whale-dream.history-browser";
const paths = {
  folder: "M3.5 19V6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5M4 11h16",
  message: "M19 5H5a1 1 0 0 0-1 1v13l4-3h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1ZM8 9h8m-8 3h5",
  reference: "M10 14l4-4M8 16H6a4 4 0 0 1 0-8h4m4 0h4a4 4 0 0 1 0 8h-4",
  chevron: "m6 9 6 6 6-6",
  browser: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18m-9-9c2 2 3.4 5.8 3.4 9S14 19 12 21c-2-2-3.4-5.8-3.4-9S10 5 12 3Z",
  next: "m9 6 6 6-6 6",
  file: "M6 3.5h7.5l4.5 4.6v12.4H6zM13.5 3.5V8H18M9 12h6m-6 4h6",
  image: "M5 4h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4Zm3.5 4a1.2 1.2 0 1 0 .1 2.4 1.2 1.2 0 0 0-.1-2.4ZM4.5 17l4.5-4 3 2 4-5 3.5 5",
  archive: "M4.5 8h15v11.5h-15zM3.5 4.5h17V8h-17zM10 12h4",
  sheet: "M6 3.5h7.5l4.5 4.6v12.4H6zM13.5 3.5V8H18M9 11h6v6H9zm0 3h6m-3-3v6",
};

function icon(kind) {
  return h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.65,
    strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false" },
    h("path", { d: paths[kind] }));
}

const styles = `
.wd-session-files-trigger,.wd-session-files-action{display:grid;place-items:center;flex-shrink:0;padding:0;color:var(--wd-sf-muted,inherit);border:1px solid transparent;background:transparent;cursor:pointer;border-radius:7px}
.wd-session-files-trigger{width:32px;height:32px;color:inherit;--wails-draggable:no-drag;-webkit-app-region:no-drag}
.wd-session-files-trigger svg,.wd-session-files-action svg{width:17px;height:17px}
.wd-session-files-trigger:hover,.wd-session-files-action:not(:disabled):hover{background:var(--wd-sf-hover,light-dark(#1f315c13,#b3c6fb1c))}
.wd-session-files-action:disabled{opacity:.38;cursor:default;pointer-events:none}
.wd-session-files-view{--wd-sf-ink:var(--wd-palette-text,light-dark(#24344b,#edf3fc));--wd-sf-muted:light-dark(#56677b,#aab8cc);--wd-sf-hover:light-dark(#e7eef9,#222f43);--wd-sf-card:color-mix(in srgb,var(--wd-palette-composer,light-dark(#f8faff,#131c29)) 86%,var(--wd-sf-ink));--wd-sf-bg:var(--wd-palette-composer,light-dark(#f7f9fd,#111a27));--wd-sf-edge:color-mix(in srgb,var(--wd-sf-ink) 15%,transparent);--wd-sf-accent:var(--wd-palette-accent,light-dark(#3454ae,#a0b2ff));height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;color:var(--wd-sf-ink);background:var(--wd-sf-bg);font:inherit;font-size:13px}
.wd-session-files-view *{box-sizing:border-box}
.wd-session-files-view :is(.wd-session-files-tab,.wd-session-files-open,.wd-session-files-action,.wd-session-files-message,.wd-session-files-history,input,select){font:inherit;color:inherit}
.wd-session-files-view :is(button,input,select):focus-visible,.wd-session-files-trigger:focus-visible{outline:2px solid var(--wd-sf-accent,#7486f1);outline-offset:1px}
.wd-session-files-top{display:grid;gap:9px;padding:12px 13px 9px}
.wd-session-files-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;background:var(--wd-sf-bg);border:1px solid var(--wd-sf-edge);border-radius:9px}
.wd-session-files-tab{border:1px solid transparent;min-height:31px;background:transparent;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;color:var(--wd-sf-muted)}
.wd-session-files-tab[aria-selected=true]{background:var(--wd-sf-hover);border-color:var(--wd-sf-edge);color:var(--wd-sf-ink);font-weight:650}
.wd-session-files-count{background:color-mix(in srgb,var(--wd-sf-accent) 17%,transparent);color:var(--wd-sf-accent);padding:1px 5px;border-radius:5px;font-size:11px;font-weight:680;font-variant-numeric:tabular-nums}
.wd-session-files-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}
.wd-session-files-tools :is(input,select){min-width:0;max-width:100%;width:100%;border:1px solid var(--wd-sf-edge);border-radius:8px;background:transparent;padding:5px 7px;font-size:11px;min-height:31px}
.wd-session-files-tools :is(input,select) option{color:var(--wd-sf-ink);background:var(--wd-sf-bg)}
.wd-session-files-total{font-size:11px;color:var(--wd-sf-muted);font-variant-numeric:tabular-nums}
.wd-session-files-rows{overflow:auto;padding:0 13px 12px;min-height:0;flex:1;scrollbar-width:thin}
.wd-session-files-list{display:grid;gap:6px}
.wd-session-files-row{min-width:0;min-height:50px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1px;padding:3px 4px 3px 6px;border:1px solid var(--wd-sf-edge);border-radius:9px;background:var(--wd-sf-card)}
.wd-session-files-open{display:flex;align-items:center;gap:8px;min-width:0;text-align:start;background:none;border:0;border-radius:6px;padding:3px 1px;cursor:pointer}
.wd-session-files-open:disabled{cursor:default}
.wd-session-files-open:not(:disabled):hover .wd-session-files-name{color:var(--wd-sf-accent)}
.wd-session-files-file-icon{display:grid;place-items:center;flex-shrink:0;width:28px;height:31px;border-radius:6px;border:1px solid var(--wd-sf-edge);color:var(--wd-sf-accent);background:color-mix(in srgb,var(--wd-sf-accent) 10%,transparent)}
.wd-session-files-file-icon svg{width:17px;height:17px}
.wd-session-files-detail{min-width:0;flex:1}
.wd-session-files-file-title{display:flex;align-items:center;gap:4px;min-width:0}
.wd-session-files-label{display:inline-block;flex-shrink:0;border-radius:4px;padding:0 3px;color:var(--wd-sf-accent);background:color-mix(in srgb,var(--wd-sf-accent) 15%,transparent);font-size:10px;font-weight:650;line-height:1.5}
.wd-session-files-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}
.wd-session-files-meta{display:block;color:var(--wd-sf-muted);font-size:10px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wd-session-files-actions{display:flex;align-items:center;gap:1px}
.wd-session-files-action{width:27px;height:30px;color:var(--wd-sf-muted)}
.wd-session-files-view .wd-session-files-reuse{display:flex;gap:4px;width:auto;padding-inline:7px;color:var(--wd-sf-accent);font-size:11px;font-weight:600;white-space:nowrap}
.wd-session-files-reuse svg{width:13px;height:13px}
.wd-session-files-entry{min-width:0}
.wd-session-files-rows{container-type:inline-size}
.wd-session-files-source{border:1px solid var(--wd-sf-edge);border-radius:10px;background:var(--wd-sf-card)}
.wd-session-files-source .wd-session-files-row{border:0;background:none;padding:5px 7px}
.wd-session-files-source-context{padding:4px 6px 6px;border-top:1px solid var(--wd-sf-edge)}
.wd-session-files-message{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;gap:7px;width:100%;min-width:0;min-height:34px;padding:4px 6px;text-align:start;background:none;border:0;border-radius:6px;cursor:pointer}
.wd-session-files-message:not(:disabled):hover{background:var(--wd-sf-hover)}
.wd-session-files-message:disabled{cursor:default}
.wd-session-files-message-icon,.wd-session-files-message-arrow{display:grid;place-items:center;color:var(--wd-sf-muted)}
.wd-session-files-message svg{width:14px;height:14px}
.wd-session-files-message-detail{min-width:0;display:grid;gap:3px}
.wd-session-files-message-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:1.35;font-weight:570}
.wd-session-files-message-time{display:block;color:var(--wd-sf-muted);font-size:10px;line-height:1.3;font-variant-numeric:tabular-nums}
.wd-session-files-message-end{display:flex;align-items:center;gap:4px;white-space:nowrap}
.wd-session-files-count-plain{color:var(--wd-sf-muted);font-size:10px;font-variant-numeric:tabular-nums}
.wd-session-files-message[aria-expanded=true] .wd-session-files-message-arrow{transform:rotate(180deg)}
.wd-session-files-occurrences{list-style:none;display:grid;gap:1px;margin:0 0 0 12px;padding:2px 0 1px 5px;border-inline-start:1px solid var(--wd-sf-edge)}
.wd-session-files-occurrence{min-width:0}
.wd-session-files-occurrence .wd-session-files-message-icon::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--wd-sf-accent)}
@container (max-width:270px){.wd-session-files-source .wd-session-files-row{grid-template-columns:minmax(0,1fr)}.wd-session-files-source .wd-session-files-actions{justify-self:end}}
.wd-session-files-native-actions{display:flex;align-items:center;flex:0 0 48px;min-block-size:27px}
.wd-session-files-app-split{display:flex;border:1px solid var(--wd-sf-edge);border-radius:6px;margin-inline-start:3px}
.wd-session-files-app-split .wd-session-files-action{height:25px;width:25px;border:0;border-radius:5px 0 0 5px}
.wd-session-files-app-split .wd-session-files-app-more{width:18px;border-inline-start:1px solid var(--wd-sf-edge);border-radius:0 5px 5px 0}
.wd-session-files-app-split .wd-session-files-app-more svg{width:12px;height:12px}
.wd-session-files-app-icon{display:block;object-fit:contain;flex:none}
.wd-session-files-app-loading{inline-size:13px;block-size:13px;border-radius:4px;background:var(--wd-sf-edge)}
.wd-session-files-app-menu-icon{display:inline-flex;inline-size:16px;block-size:16px}
.wd-session-files-app-menu-icon svg{inline-size:100%;block-size:100%}
.wd-session-files-empty,.wd-session-files-status{margin:0;color:var(--wd-sf-muted);font-size:12px;padding:12px 0;text-align:center}
.wd-session-files-history{display:block;margin:10px auto 0;border:1px solid var(--wd-sf-edge);background:transparent;border-radius:7px;padding:5px 10px;cursor:pointer}
.wd-session-files-history:disabled{opacity:.65;cursor:default}
[data-wd-session-file-located]{position:relative;--wd-locate-accent:var(--wd-palette-accent,light-dark(#4165c5,#94aaff))}
[data-wd-session-file-located]::after{content:"";position:absolute;inset:7px auto auto 3px;inline-size:3px;block-size:min(22px,75%);border-radius:4px;background:var(--wd-locate-accent);pointer-events:none;z-index:3;animation:wd-session-file-locate 1200ms ease-out both}
[data-wd-session-file-located=file]::after{inset:1px;inline-size:auto;block-size:auto;border-radius:8px;border-inline-start:3px solid var(--wd-locate-accent);background:color-mix(in srgb,var(--wd-locate-accent) 15%,transparent)}
@keyframes wd-session-file-locate{0%,28%{opacity:1}100%{opacity:0}}
@media(prefers-reduced-motion:reduce){[data-wd-session-file-located]::after{animation:none}}
`;

const category = {
  image: "png jpg jpeg webp gif bmp tif tiff svg avif heic",
  table: "xlsx xls xlsm csv tsv ods numbers",
  document: "pdf doc docx odt txt md rtf ppt pptx key",
  archive: "zip rar 7z tar tgz gz",
};

function fileCategory(name, kind) {
  const ext = name.split(".").at(-1)?.toLowerCase();
  return Object.keys(category).find(key => category[key].split(" ").includes(ext)) ??
    (Object.hasOwn(category, kind) ? kind : "file");
}

function sizeLabel(size, lang) {
  let unit = 0;
  while (size >= 1024 && unit < 4) { size /= 1024; unit++; }
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(size) + " " + ["B", "KB", "MB", "GB", "TB"][unit];
}

const knownSize = size => typeof size === "number" && Number.isSafeInteger(size) && size >= 0;
const knownTime = time => Number.isFinite(time) && time > 0 && time <= 8.64e15;
const byRecent = (a, b) => (knownTime(b.time) ? b.time : 0) - (knownTime(a.time) ? a.time : 0) ||
  (b.seq ?? 0) - (a.seq ?? 0) || (b.slot ?? b.index ?? 0) - (a.slot ?? a.index ?? 0);
const basename = path => path.split(/[\\/]/).at(-1);
const pathSegment = part => encodeURIComponent(part).replaceAll("%3A", ":");

function pathAddress(sessionId, path) {
  const normalized = path.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
  return "dsh-resource://file/session/" + pathSegment(sessionId) + "/" + normalized.split("/").map(pathSegment).join("/");
}

function deliveryActionUrl(file) {
  return "api/present.open?" + new URLSearchParams({ sessionId: file.sessionId, seq: String(file.seq), index: String(file.index) });
}

function parseApplications(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  return value.flatMap(app => {
    if (typeof app?.id !== "string" || !app.id || seen.has(app.id) || typeof app.name !== "string") return [];
    seen.add(app.id);
    const icon = typeof app.icon === "string" && /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(app.icon) ?
      app.icon : undefined;
    return [{ id: app.id, name: app.name, default: app.default === true, icon }];
  });
}

function ApplicationIcon({ source }) {
  const [failed, setFailed] = useState(false);
  return source && !failed ? h("img", { src: source, width: 14, height: 14, alt: "", draggable: false,
    className: "wd-session-files-app-icon", onError: () => setFailed(true) }) : h(IconRightUpOutlineRegular, { size: 14 });
}

function deliveryRows(snapshot, sessionId) {
  const records = [];
  for (const { type, event } of snapshot?.entries ?? []) {
    if (type !== "event" || event.type !== "deliverables/presented" || !Array.isArray(event.data?.files) ||
        !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.data.turn) || event.data.turn < 1 ||
        typeof event.data.callId !== "string" || !event.data.callId) continue;
    event.data.files.forEach((file, index) => {
      if (typeof file?.path !== "string" || !file.path.trim() || !basename(file.path)) return;
      records.push({ id: "delivery:" + event.seq + ":" + index, source: "delivery",
        sessionId, seq: event.seq, turn: event.data.turn, index, name: basename(file.path),
        path: file.path, time: event.time, size: knownSize(file.size) ? file.size : undefined });
    });
  }
  return records;
}

function groupSources(records, pathFor) {
  const groups = new Map();
  for (const file of records.sort(byRecent)) {
    const rawPath = pathFor(file);
    const path = rawPath?.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "").normalize("NFC");
    const location = path && (/^[a-z]:\//i.test(path) || rawPath.startsWith("\\\\") ? path.toLowerCase() : path);
    const attachmentId = file.original.attachment?.attachmentId;
    const identity = location ? ["path", location] : attachmentId
      ? ["content", attachmentId, file.name.normalize("NFC")] : ["occurrence", file.id];
    const key = JSON.stringify(identity);
    const group = groups.get(key);
    if (group) group.occurrences.push(file);
    else groups.set(key, { key, file, occurrences: [file] });
  }
  return [...groups.values()];
}

function watchSessionFiles(binding, attachments, sessionId, refresh) {
  const feed = binding?.eventSource;
  const release = feed?.subscribe(() => {
    const { change } = feed.getSnapshot();
    if (change?.kind !== "append" || change.entries.some(({ type, event }) => type === "event" &&
        (event.type === "deliverables/presented" || event.type === "user/message"))) refresh();
  });
  const drop = attachments?.subscribe?.(changedId => { if (changedId === sessionId) refresh(); });
  const session = binding?.session;
  const readHistoryState = () => {
    const status = session?.getSnapshot?.();
    return [status?.loadingOlder, status?.historyLoadStatus, status?.removed].join(":");
  };
  let historyState = readHistoryState();
  const releaseSession = session?.subscribe?.(() => {
    const next = readHistoryState();
    if (next !== historyState) { historyState = next; refresh(); }
  });
  return () => { release?.(); drop?.(); releaseSession?.(); };
}

function locateElement(file) {
  for (const conversation of document.querySelectorAll("[data-conversation-session]")) {
    if (conversation.dataset.conversationSession !== file.sessionId || !conversation.getClientRects().length) continue;
    if (file.source === "delivery" && Number.isSafeInteger(file.turn)) {
      const tail = conversation.querySelector('[data-turn-tail="' + file.turn + '"]');
      if (tail) {
        const anchor = tail.querySelector("[data-presented-files-row]") ?? tail;
        const url = deliveryActionUrl(file);
        const marker = [...anchor.querySelectorAll('[data-wd-delivery-coordinate]')].find(node => node.dataset.wdDeliveryCoordinate === url);
        const card = marker?.closest("[data-presented-file]");
        return card ? { element: card, mode: "file" } : { element: anchor, mode: "anchor" };
      }
    }
    if (file.original?.id) {
      const card = [...conversation.querySelectorAll('[data-wd-sent-entry]')].find(node =>
        node.dataset.wdSentEntry === file.original.id);
      if (card) return { element: card, mode: "file" };
    }
    if (file.messageId) {
      const key = "13:input-message" + file.messageId;
      const row = [...conversation.querySelectorAll('[data-chat-node-key]')].find(node => node.dataset.chatNodeKey === key);
      if (row) {
        const anchor = row.querySelector('[data-message-bubble], [data-message-attachments]') ?? row;
        return { element: anchor, mode: "anchor" };
      }
    }
    if (Number.isSafeInteger(file.turn)) {
      const row = conversation.querySelector('[data-chat-turn="' + file.turn + '"]');
      if (row) return { element: row, mode: "anchor" };
    }
  }
}

export function mountSessionFiles(ctx, language, attachments) {
  const slots = ctx.get("slots");
  const sidebar = ctx.get("sidebarRight");
  const types = ctx.get("sidebarRightTabs");
  if (!slots || !sidebar || !types) return () => {};
  const lifetime = new AbortController();
  const local = (zh, en) => language?.() === "en" ? en : zh;
  const title = () => local("文件历史", "File history");
  const currentBinding = id => ctx.get("sessions")?.binding?.(id);
  const remote = ctx.get("remote");
  const views = new Map();
  const applicationCache = new Map();
  const applicationQueue = [];
  let applicationReads = 0;
  let desktopAvailable = false;
  let checkDesktop;
  let browserAssociation;
  let browserAssociationExpires = 0;
  let checkNativeBrowser;
  const sheet = Object.assign(document.createElement("style"), { textContent: styles });
  sheet.dataset.wdSessionFilesStyles = "";
  let locateRequest = 0;
  let highlighted;
  let highlightTimer;

  function clearHighlight() {
    window.clearTimeout(highlightTimer);
    highlighted?.removeAttribute("data-wd-session-file-located");
    highlighted = undefined;
  }

  function showHighlight({ element, mode }) {
    clearHighlight();
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    element.dataset.wdSessionFileLocated = mode;
    highlighted = element;
    highlightTimer = window.setTimeout(clearHighlight, 1200);
  }

  function revealPath(file) {
    return file.path ?? attachments?.localImageOrigin?.(file.original);
  }

  function saveView(sessionId, state) {
    views.delete(sessionId);
    views.set(sessionId, state);
    if (views.size > 64) views.delete(views.keys().next().value);
  }

  function runApplicationReads() {
    while (applicationReads < 3 && applicationQueue.length) {
      const task = applicationQueue.shift();
      if (task.signal.aborted) {
        task.done(null);
        continue;
      }
      applicationReads++;
      task.read().then(task.done, () => task.done(null)).finally(() => {
        applicationReads--;
        runApplicationReads();
      });
    }
  }

  async function readApplications(target, delivery, signal) {
    const cacheKey = (delivery ? "output:" : "source:") + target;
    const cached = applicationCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 120000) return cached.apps;
    return new Promise(done => {
      applicationQueue.push({ done, signal, read: async () => {
        const request = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
        const result = delivery ? await fetch(target, { signal: request }) :
          await remote?.session?.workspacePathApplications?.({ path: target }, request);
        const entries = result?.ok ? (delivery ? await result.json() : result.value) : null;
        const apps = parseApplications(entries);
        if (apps !== null && !signal.aborted) {
          applicationCache.delete(cacheKey);
          applicationCache.set(cacheKey, { apps, at: Date.now() });
          if (applicationCache.size > 96) applicationCache.delete(applicationCache.keys().next().value);
        }
        return apps;
      } });
      runApplicationReads();
    });
  }

  function readNativeBrowser() {
    if (browserAssociationExpires > Date.now()) return Promise.resolve(browserAssociation);
    checkNativeBrowser ??= fetch(browserEndpoint, { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(12000)]) })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null)
      .then(result => {
        browserAssociation = result?.available === true ? { id: typeof result.id === "string" ? result.id : "" } : null;
        browserAssociationExpires = Date.now() + (browserAssociation ? 60000 : 10000);
        return browserAssociation;
      }).finally(() => { checkNativeBrowser = undefined; });
    return checkNativeBrowser;
  }

  function NativeFileActions({ file, desktop, nativePath, onDeliveryAction, onError }) {
    const mount = useRef(null);
    const [visible, setVisible] = useState(false);
    const [hostPath, setHostPath] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [retry, retryApps] = useReducer(value => value + 1, 0);
    const [applications, setApplications] = useState();
    const [nativeBrowser, setNativeBrowser] = useState(() => browserAssociation);
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    const actionLife = useRef(null);
    const delivery = file.source === "delivery";
    const target = delivery ? deliveryActionUrl(file) : hostPath;
    const source = file.original;
    const supportsBrowser = Number.isSafeInteger(file.seq) && canOpenFileInBrowser(file.name) &&
      (delivery || source?.source === "path" && typeof source.batch === "string" && Number.isSafeInteger(source.number));
    useEffect(() => {
      const controller = new AbortController();
      actionLife.current = controller;
      return () => controller.abort();
    }, []);
    useEffect(() => {
      if (!desktop || visible || !mount.current) return;
      const visibility = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          visibility.disconnect();
          setVisible(true);
        }
      });
      visibility.observe(mount.current);
      return () => visibility.disconnect();
    }, [desktop, visible]);
    useEffect(() => {
      if (!visible || !desktop || delivery || !nativePath) return;
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, lifetime.signal]);
      Promise.resolve().then(() => remote?.workspaceFiles?.stat?.(file.sessionId, nativePath.replaceAll("\\", "/"), signal)).then(result => {
        if (!signal.aborted && result?.ok && typeof result.value?.absolutePath === "string") {
          setHostPath(result.value.absolutePath);
        }
      }).catch(() => {});
      return () => controller.abort();
    }, [visible, desktop, delivery, nativePath, file.sessionId]);
    useEffect(() => {
      if (!visible || !target) return;
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, lifetime.signal]);
      void readApplications(target, delivery, signal).then(apps => {
        if (!signal.aborted) setApplications(apps);
      });
      return () => controller.abort();
    }, [visible, target, retry, delivery]);
    useEffect(() => {
      if (!visible || !target || !supportsBrowser) return;
      const controller = new AbortController();
      void readNativeBrowser().then(result => {
        if (!controller.signal.aborted && !lifetime.signal.aborted) setNativeBrowser(result);
      });
      return () => controller.abort();
    }, [visible, target, supportsBrowser]);
    if (!desktop || !nativePath) return null;
    async function onAction(action, application) {
      setMenuOpen(false);
      if (busy.current || !target || !actionLife.current) return;
      const signal = AbortSignal.any([actionLife.current.signal, lifetime.signal]);
      busy.current = true;
      setPending(true);
      try {
        if (action === "browser") {
          const response = await fetch(browserEndpoint, { method: "POST", signal, headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: file.sessionId, seq: file.seq,
              ...(delivery ? { index: file.index } : { batch: source.batch, number: source.number }) }) });
          if (!response.ok && !signal.aborted) onError(action);
          return;
        }
        const result = delivery ? await onDeliveryAction(file, action, application) :
          await remote?.session?.openWorkspacePath?.(action === "reveal" ? { path: target, action } :
            { path: target, ...(application ? { application } : {}) }, signal);
        if (!signal.aborted && (delivery ? result?.kind === "failed" : result?.ok !== true)) onError(action);
      } catch {
        if (!signal.aborted) onError(action);
      } finally {
        busy.current = false;
        if (!signal.aborted) setPending(false);
      }
    }
    const preferred = applications?.find(app => app.default) ?? applications?.[0];
    const reveal = local("显示文件位置", "Show file location");
    const fallback = applications !== undefined && !preferred;
    const primaryLabel = preferred ? local("用 " + preferred.name + " 打开", "Open in " + preferred.name) :
      fallback ? reveal : local("使用默认应用打开", "Open in default application");
    const more = local("选择打开方式", "Choose an application");
    const items = applications?.map(app => ({ id: "app:" + app.id, icon: h(ApplicationIcon, { key: app.icon, source: app.icon }),
      label: app === preferred ? app.name + local("（默认）", " (default)") : app.name })) ??
      [{ id: "status", label: applications === null ? local("无法读取应用列表", "Applications unavailable") :
        local("正在载入应用…", "Loading applications…"), disabled: true }];
    const footer = [];
    if (supportsBrowser && nativeBrowser && !applications?.some(app =>
      nativeBrowser.id && basename(app.id)?.toLowerCase() === nativeBrowser.id)) {
      footer.push({ id: "browser", icon: h("span", { className: "wd-session-files-app-menu-icon" }, icon("browser")),
        label: local("用默认浏览器打开", "Open in default browser") });
    }
    footer.push({ id: "reveal", icon: h(IconFolderOpenOutlineRegular), label: reveal });
    const loading = applications === undefined;
    const anchor = h("div", { className: "wd-session-files-app-split" },
      h("button", { type: "button", disabled: pending || loading, className: "wd-session-files-action", title: primaryLabel,
        "aria-label": primaryLabel, "data-open-path-open": "",
        onClick: () => void onAction(fallback ? "reveal" : "open", preferred?.default ? undefined : preferred?.id) },
      loading ? h("span", { className: "wd-session-files-app-loading", "aria-hidden": true }) :
        fallback ? h(IconFolderOpenOutlineRegular, { size: 14 }) :
        h(ApplicationIcon, { key: preferred?.icon, source: preferred?.icon })),
      h("button", { type: "button", disabled: pending, className: "wd-session-files-action wd-session-files-app-more",
        title: more, "aria-label": more, "aria-haspopup": "menu", "aria-expanded": menuOpen, "data-open-path-more": "",
        onClick: () => {
          if (!menuOpen) {
            if (applications === null) retryApps();
            if (supportsBrowser && browserAssociationExpires <= Date.now()) {
              void readNativeBrowser().then(result => { if (!actionLife.current?.signal.aborted) setNativeBrowser(result); });
            }
          }
          setMenuOpen(!menuOpen);
        } }, icon("chevron")));
    return h("span", { ref: mount, className: "wd-session-files-native-actions", "data-wd-native-file-actions": file.id },
      visible && target && h(Menu, { open: menuOpen, dense: true, portal: true, autoFocus: true, align: "end",
        items, footer, anchor,
        onClose: () => setMenuOpen(false),
        onSelect: id => {
          if (id === "browser" || id === "reveal") void onAction(id);
          else if (id.startsWith("app:")) void onAction("open", id.slice(4));
        } }));
  }

  function HeaderAction({ sessionId }) {
    if (!sessionId) return null;
    return h("button", {
      type: "button", className: "wd-session-files-trigger", "data-wd-session-files-trigger": "",
      title: title(), "aria-label": title(),
      onClick: () => {
        if (currentBinding(sessionId)) {
          sidebar.openTabIn(sessionId, TAB);
          if (ctx.get("uiSession")?.adapter?.current?.getSnapshot?.().key === sessionId && !sidebar.isExpanded()) {
            sidebar.toggleExpanded();
          }
        }
      },
    }, icon("folder"));
  }

  function SessionFilesPane({ sessionId }) {
    const [view, setView] = useState(() => views.get(sessionId) ?? { source: "delivery", filter: "", search: "", expanded: "" });
    const { source, filter, search, expanded } = view;
    const [notice, setNotice] = useState("");
    const [desktop, setDesktop] = useState(() => desktopAvailable);
    const [epoch, refresh] = useReducer(value => value + 1, 0);
    const pending = useRef(new Set());
    const paneLife = useRef(null);
    const tabList = useRef(null);
    const binding = currentBinding(sessionId);
    const lang = language?.() === "en" ? "en" : "zh-CN";
    const fileDate = useMemo(() => new Intl.DateTimeFormat(lang, {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }), [lang]);
    const occurrenceDate = useMemo(() => new Intl.DateTimeFormat(lang, {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }), [lang]);
    const snapshot = binding?.eventSource?.getSnapshot?.();

    function updateView(change) {
      const next = { ...view, ...change };
      saveView(sessionId, next);
      setView(next);
    }

    useEffect(() => {
      const controller = new AbortController();
      paneLife.current = controller;
      const signal = AbortSignal.any([controller.signal, lifetime.signal]);
      const stop = watchSessionFiles(binding, attachments, sessionId, refresh);
      if (typeof remote?.session?.canOpenWorkspacePath === "function") {
        checkDesktop ??= Promise.resolve().then(() => remote.session.canOpenWorkspacePath()).then(value => {
          desktopAvailable = value === true || (value?.ok === true && value.value === true);
          return desktopAvailable;
        }).catch(() => { checkDesktop = undefined; return false; });
        checkDesktop.then(available => { if (!signal.aborted) setDesktop(available); });
      }
      return () => { controller.abort(); stop(); };
    }, [binding, sessionId]);

    const { output, sources } = useMemo(() => {
      const output = deliveryRows(binding?.eventSource?.getSnapshot?.(), sessionId).sort(byRecent);
      const uploaded = (attachments?.listSession?.(sessionId) ?? [])
        .filter(file => file && typeof file.name === "string" && typeof file.id === "string")
        .map(file => ({ ...file, original: file, source: "upload", sessionId }));
      return { output, sources: groupSources(uploaded, revealPath) };
    }, [binding, sessionId, epoch]);
    const all = source === "upload" ? sources.map(group => group.file) : output;
    const sizes = all.filter(file => knownSize(file.size));
    const capacity = sizes.reduce((sum, file) => sum + file.size, 0);
    const query = search.normalize("NFKC").trim().toLowerCase();
    const matches = file => (!filter || fileCategory(file.name, file.kind) === filter) &&
      (!query || (file.name + " " + (file.label ?? "")).normalize("NFKC").toLowerCase().includes(query));
    const visible = source === "upload" ? sources.filter(group => group.occurrences.some(matches)) : output.filter(matches);
    const requiresEarlier = snapshot?.hasMore === true;
    const sessionState = binding?.session?.getSnapshot?.();
    const fetching = sessionState?.loadingOlder === true;
    const labels = {
      delivery: local("输出内容", "Outputs"),
      upload: local("来源", "Sources"),
      file: local("文件", "File"),
      locate: local("定位原消息", "Go to original message"),
      reuse: local("引用到输入框", "Reference in composer"),
      unavailable: local("此附件暂不可引用", "Attachment unavailable for reference"),
      recordOnly: local("仅有来源记录", "Source record only"),
      attachmentOnly: local("仅发送附件", "Attachment only"),
      usageHistory: local("使用记录", "Usage history"),
    };

    async function openDelivery(file, action, application) {
      const signal = AbortSignal.any([paneLife.current?.signal ?? lifetime.signal, lifetime.signal]);
      if (signal.aborted) return { kind: "skipped" };
      const url = deliveryActionUrl(file) + (action === "reveal" ? "&action=reveal" :
        application ? "&application=" + encodeURIComponent(application) : "");
      let ok = false;
      try { ok = (await fetch(url, { method: "POST", signal })).ok; } catch { /* Let DSH report an unavailable gesture. */ }
      if (signal.aborted) return { kind: "skipped" };
      if (ok) return { kind: action === "reveal" ? "revealed" : "opened" };
      return { kind: "failed", failure: action === "reveal" ? "revealError" : "openError" };
    }

    async function act(file, verb) {
      if (!paneLife.current || pending.current.has(file.id)) return;
      const signal = AbortSignal.any([paneLife.current.signal, lifetime.signal]);
      const request = verb === "locate" ? ++locateRequest : undefined;
      pending.current.add(file.id);
      setNotice("");
      try {
        if (verb === "locate") {
          let target = locateElement(file);
          if (!target && Number.isSafeInteger(file.seq)) {
            await binding?.session?.loadThrough?.(file.seq);
            for (let frame = 0; frame < 4 && !signal.aborted && request === locateRequest && !target; frame++) {
              await new Promise(resolve => requestAnimationFrame(resolve));
              target = locateElement(file);
            }
          }
          if (signal.aborted || request !== locateRequest) return;
          if (!target) throw new Error("locate");
          showHighlight(target);
          return;
        }
        if (verb === "open") {
          if (file.source === "upload") {
            if (typeof attachments?.openEntry !== "function" || await attachments.openEntry(file.original) === false) throw new Error("open");
          } else {
            sidebar.openResourceIn(sessionId, pathAddress(sessionId, file.path));
          }
          return;
        }
        if (verb === "reuse" && await attachments?.reuseEntry?.(file.original, signal) !== true) throw new Error("reuse");
      } catch {
        if (!signal.aborted && (request === undefined || request === locateRequest)) setNotice(verb === "locate" ? local("请在对话视图中查看原消息。", "Open the chat view to find the original message.") :
          verb === "reuse" ? local("暂时无法引用文件，请回到对话输入框后重试。", "Could not reference the file. Return to the chat composer and try again.") :
            local("文件暂不可打开。", "The file could not be opened."));
      } finally {
        pending.current.delete(file.id);
      }
    }

    function selectTab(next) { updateView({ source: next }); setNotice(""); }
    function keyboardTab(event) {
      const keys = ["delivery", "upload"];
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? keys[0] : event.key === "End" ? keys[1] : keys.find(value => value !== source);
      selectTab(next);
      tabList.current?.querySelector("[data-wd-session-files-tab=" + next + "]")?.focus();
    }

    function locateButton(file) {
      const locatable = !!file.messageId || Number.isSafeInteger(file.turn);
      return h("button", { type: "button", className: "wd-session-files-action", disabled: !locatable,
        title: labels.locate, "aria-label": labels.locate + " " + file.name,
        "data-wd-session-files-locate": file.id, onClick: () => void act(file, "locate") }, icon("message"));
    }

    function reuseButton(file) {
      const reusable = attachments?.canReuseEntry?.(file.original) === true;
      return h("span", { title: reusable ? undefined : labels.unavailable },
        h("button", { type: "button", className: "wd-session-files-action wd-session-files-reuse",
          disabled: !reusable, title: labels.reuse, "aria-label": labels.reuse + " " + [file.label, file.name].filter(Boolean).join(" "),
          "data-wd-session-files-reuse": file.id, onClick: () => void act(file, "reuse") },
          icon("reference"), local("引用", "Reference")));
    }

    function messageContext(file, group, groupOpen) {
      const repeated = (group?.occurrences.length ?? 0) > 1;
      const expandedLabel = groupOpen ? labels.usageHistory : null;
      const messageTitle = file.messageTitle || labels.attachmentOnly;
      const messageTime = knownTime(file.time) ? occurrenceDate.format(file.time) : local("时间未知", "Time unavailable");
      const locatable = !!file.messageId || Number.isSafeInteger(file.turn);
      const props = repeated ? {
        "aria-expanded": groupOpen,
        "aria-label": [labels.usageHistory, group.occurrences.length, !groupOpen && messageTitle].filter(Boolean).join(" "),
        "data-wd-session-files-repeat": group.occurrences.length,
        onClick: () => updateView({ expanded: groupOpen ? "" : group.key }),
      } : {
        disabled: !locatable,
        "aria-label": [labels.locate, messageTitle, messageTime].join(" "),
        "data-wd-session-files-locate": file.id,
        onClick: () => void act(file, "locate"),
      };
      return h("button", { type: "button", className: "wd-session-files-message",
        title: expandedLabel || file.messagePreview || messageTitle, ...props },
        h("span", { className: "wd-session-files-message-icon" }, group ? icon("message") : null),
        h("span", { className: "wd-session-files-message-detail" },
          h("span", { className: "wd-session-files-message-title", "data-wd-session-files-message-title": expandedLabel ? undefined : "" },
            expandedLabel || messageTitle),
          !expandedLabel && (knownTime(file.time) ? h("time", {
            className: "wd-session-files-message-time", dateTime: new Date(file.time).toISOString(),
          }, messageTime) : h("span", { className: "wd-session-files-message-time" }, messageTime))),
        h("span", { className: "wd-session-files-message-end" },
          repeated && h("span", { className: "wd-session-files-count-plain" }, group.occurrences.length + local(" 次", " times")),
          h("span", { className: "wd-session-files-message-arrow" }, icon(repeated ? "chevron" : "next"))));
    }

    function row(file, group) {
      const kind = fileCategory(file.name, file.kind);
      const canOpen = file.source === "delivery" || (typeof attachments?.openEntry === "function" &&
        (!!file.path || file.kind === "image"));
      const repeated = (group?.occurrences.length ?? 0) > 1;
      const groupOpen = repeated && expanded === group.key;
      const recent = knownTime(file.time) ? fileDate.format(file.time) : "";
      const meta = [
        knownSize(file.size) ? sizeLabel(file.size, lang) : "",
        !group ? recent : "",
        canOpen ? "" : labels.recordOnly,
      ].filter(Boolean).join(" · ");
      const nativePath = revealPath(file);
      return h("div", { key: group?.key ?? file.id, className: "wd-session-files-entry" + (group ? " wd-session-files-source" : "") },
        h("div", { className: "wd-session-files-row", "data-wd-session-files-row": file.id },
        h("button", { type: "button", className: "wd-session-files-open", disabled: !canOpen,
          title: canOpen ? file.name : file.name + " · " + labels.recordOnly,
          "aria-label": (canOpen ? local("打开文件", "Open file") : labels.recordOnly) + " " +
            [file.label, file.name].filter(Boolean).join(" "),
          "data-wd-session-files-open": file.id, onClick: () => void act(file, "open") },
          h("span", { className: "wd-session-files-file-icon" }, icon(kind === "table" ? "sheet" :
            kind === "image" || kind === "archive" ? kind : "file")),
          h("span", { className: "wd-session-files-detail" },
            h("span", { className: "wd-session-files-file-title" },
              file.label ? h("span", { className: "wd-session-files-label" }, file.label) : null,
              h("span", { className: "wd-session-files-name" }, file.name)),
            meta ? h("span", { className: "wd-session-files-meta" }, meta) : null)),
        h("span", { className: "wd-session-files-actions" },
          group ? reuseButton(file) : locateButton(file),
          h(NativeFileActions, { key: file.id + ":" + nativePath, file, desktop, nativePath, onDeliveryAction: openDelivery,
            onError: action => setNotice(action === "browser" ? local("无法用默认浏览器打开", "Could not open in the default browser") :
              action === "reveal" ? local("无法显示文件位置", "Could not show the file location") :
              local("无法打开此文件", "Could not open this file")) }))),
        group && h("div", { className: "wd-session-files-source-context" },
          messageContext(file, group, groupOpen),
          groupOpen && h("ol", { className: "wd-session-files-occurrences", "aria-label": labels.usageHistory },
            group.occurrences.map(visit => h("li", { key: visit.id, className: "wd-session-files-occurrence",
              "data-wd-session-files-occurrence": visit.id }, messageContext(visit))))));
    }

    return h("section", { className: "wd-session-files-view", "aria-label": title(), "data-wd-session-files-pane": sessionId },
      h("div", { className: "wd-session-files-top" },
        h("div", { ref: tabList, className: "wd-session-files-tabs", role: "tablist", "aria-label": title(), onKeyDown: keyboardTab },
          [["delivery", output.length], ["upload", sources.length]].map(([kind, count]) =>
            h("button", { key: kind, type: "button", className: "wd-session-files-tab", role: "tab", "aria-selected": source === kind,
              "data-wd-session-files-tab": kind, tabIndex: source === kind ? 0 : -1, onClick: () => selectTab(kind) },
              labels[kind], h("span", { className: "wd-session-files-count" }, count)))),
        sizes.length ? h("div", { className: "wd-session-files-total" },
          (sizes.length < all.length || requiresEarlier ? local("已知容量", "Known total") : local("合计", "Total")) + " " + sizeLabel(capacity, lang)) : null,
        h("div", { className: "wd-session-files-tools" },
          h("input", { type: "search", value: search, "aria-label": local("搜索文件名或编号", "Search filename or number"),
            placeholder: local("搜索文件名或编号", "Search files"), onChange: event => updateView({ search: event.target.value }) }),
          h("select", { value: filter, "aria-label": local("按类型筛选文件", "Filter by file type"), onChange: event => updateView({ filter: event.target.value }) },
            [["", local("全部类型", "All types")], ["image", local("图片", "Images")], ["document", local("文档", "Documents")],
              ["table", local("表格", "Tables")], ["archive", local("压缩包", "Archives")], ["file", local("其他", "Other")]]
              .map(([value, label]) => h("option", { key: value, value }, label))))),
      h("div", { className: "wd-session-files-rows", role: "tabpanel", "aria-label": labels[source] },
        visible.length ? h("div", { className: "wd-session-files-list" }, visible.map(item =>
          source === "upload" ? row(item.file, item) : row(item))) :
          h("p", { className: "wd-session-files-empty" }, query || filter ? local("没有匹配的文件", "No matching files") :
            (source === "delivery" ? local("暂无输出内容", "No outputs yet") : local("暂无附件来源", "No sources yet"))),
        requiresEarlier ? h("button", { type: "button", className: "wd-session-files-history", disabled: fetching,
          onClick: () => void binding?.session?.loadOlder?.() },
        fetching ? local("正在载入…", "Loading…") : local("载入更早记录", "Load earlier records")) : null,
        notice ? h("p", { className: "wd-session-files-status", role: "status" }, notice) : null));
  }

  const removeType = types.register({ id: PROVIDER, kind: TAB, title });
  const removePane = slots.inject("sidebar.right.pane.tab", () => slots.register({
    name: "sidebar.right.pane.tab", key: PROVIDER,
  }, props => h(SessionFilesPane, { ...props, key: props.sessionId })));
  const removeTitle = slots.inject("sidebar.right.pane.tab.title", () => slots.register({
    name: "sidebar.right.pane.tab.title", key: PROVIDER,
  }, () => title()));
  const removeHeader = slots.inject("conversation.session.header.utilities", () => slots.register({
    name: "conversation.session.header.utilities", id: PROVIDER,
  }, HeaderAction));
  const removeDeliveryMarker = slots.inject("deliverables.file.actions", () => slots.register({
    name: "deliverables.file.actions", id: PROVIDER,
  }, ({ actionUrl }) => h("span", { hidden: true, "data-wd-delivery-coordinate": actionUrl })));
  document.head.append(sheet);
  return () => {
    lifetime.abort();
    clearHighlight();
    views.clear();
    applicationCache.clear();
    removeDeliveryMarker();
    removeHeader();
    removeTitle();
    removePane();
    removeType();
    sheet.remove();
  };
}
