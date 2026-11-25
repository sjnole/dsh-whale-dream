import { formatAttachmentSize, referencePath } from "./attachment-references.js";

const nativeCardSelector = "[data-wd-attachment-image], [data-wd-attachment-card]";
const pathCardSelector = "[data-wd-reference-card]";
const spreadsheets = /^(?:csv|tsv|xls|xlsx|xlsm|xlsb|xlt|xltx|ods|numbers|et)$/i;
const documents = /^(?:doc|docx|docm|dot|dotx|rtf|odt|pages|wps|txt|md|markdown|rst|pdf|ppt|pptx|pptm|pps|ppsx|odp|key|dps|epub)$/i;
const images = /^(?:png|jpe?g|gif|webp|avif|svg|bmp|tiff?|heic|heif|ico)$/i;
const style = `
  [data-wd-attached-placeholder]:not(:has(> [data-composer-placeholder], > [data-composer-composing]))::after {
    position: absolute;
    inset: 4px 8px auto 14px;
    overflow: hidden;
    color: var(--dsw-alias-label-caption);
    content: attr(data-wd-attached-placeholder);
    white-space: nowrap;
    text-overflow: ellipsis;
    pointer-events: none;
    user-select: none;
  }
  [data-wd-file-only-original] { display: none !important; }
  [data-wd-attachment-rail] > * {
    order: var(--wd-draft-attachment-order, 0);
  }
  [data-wd-attachment-rail] [data-wd-composer-numbered] {
    --wd-number-text-start: 56px;
    box-sizing: border-box;
    width: 194px;
    width: clamp(166px, 38cqi, 196px);
    height: var(--wd-attachment-height, 64px);
    position: relative;
    flex: none;
    border: 1px solid color-mix(in srgb, var(--wd-attachment-ink) 14%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--wd-attachment-ink) 5%, var(--wd-attachment-surface));
  }
  [data-wd-attachment-rail] [data-wd-composer-numbered]:hover {
    border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 42%, transparent);
  }
  [data-wd-composer-numbered] :is([class$="_name"], [class$="_meta"], [class$="_metaFailed"],
    [data-wd-reference-name], [data-wd-reference-type]) {
    visibility: hidden;
  }
  [data-wd-attachment-rail] [data-wd-attachment-image][data-wd-composer-numbered] {
    --wd-number-text-start: 62px;
  }
  [data-wd-attachment-image][data-wd-composer-numbered] button[class*="_thumbnail"] {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    padding: 8px 9px;
    border: 0;
    border-radius: inherit;
    background: transparent;
  }
  [data-wd-attachment-image][data-wd-composer-numbered] button[class*="_thumbnail"] img {
    width: 43px;
    height: 44px;
    flex: none;
    border-radius: 7px;
  }
  [data-wd-attachment-image][data-wd-composer-numbered] [class*="_failureGlyph"] {
    inset: 9px auto 9px 9px;
    width: 43px;
  }
  [data-wd-attachment-image][data-wd-composer-numbered] [class$="_progressTrack"] {
    inset-inline: 11px auto;
    width: 39px;
  }
  [data-wd-composer-file-name] {
    position: absolute;
    inset-block-start: 10px;
    inset-inline: var(--wd-number-text-start) 27px;
    overflow: hidden;
    color: var(--wd-attachment-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }
  [data-wd-composer-file-meta] {
    position: absolute;
    inset-block-end: 9px;
    inset-inline: var(--wd-number-text-start) 7px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--wd-attachment-muted);
    font: inherit;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
  }
  [data-wd-composer-file-meta] > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button[data-wd-attachment-number] {
    display: inline-flex;
    align-items: center;
    flex: none;
    min-height: 20px;
    padding: 0 5px;
    border: 0;
    border-radius: 4px;
    color: var(--dsw-alias-brand-primary, var(--wd-attachment-ink));
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, var(--wd-attachment-surface));
    font: inherit;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    pointer-events: auto;
  }
  button[data-wd-attachment-number]:hover {
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--wd-attachment-surface));
  }
  button[data-wd-attachment-number]:focus-visible {
    outline: 2px solid var(--dsw-alias-brand-primary);
    outline-offset: -1px;
  }
  [data-wd-composer-numbered] > :is([data-wd-attachment-remove], button[class*="_remove"]) {
    inset-block-start: 4px;
    inset-inline-end: 4px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    box-shadow: none;
    color: var(--wd-attachment-muted);
    background: transparent;
  }
  [data-wd-composer-numbered]:hover > :is([data-wd-attachment-remove], button[class*="_remove"]) {
    opacity: 1;
  }
  [data-wd-composer-numbered] > :is([data-wd-attachment-remove], button[class*="_remove"]):hover {
    background: color-mix(in srgb, var(--wd-attachment-ink) 12%, transparent);
    color: var(--wd-attachment-ink);
  }
`;

function extension(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : "";
}

function fileKind(name, isImage) {
  if (isImage) return "image";
  const suffix = extension(name);
  if (spreadsheets.test(suffix)) return "table";
  if (documents.test(suffix)) return "document";
  if (images.test(suffix)) return "image";
  return "file";
}

function matchingNativeCard(card, item) {
  const imageCard = card.hasAttribute("data-wd-attachment-image");
  if (imageCard !== (item.kind === "image")) return false;
  if (!imageCard) return card.title === item.file.name;
  const img = card.querySelector("img");
  return img !== null && (img.alt === item.file.name ||
    !!item.previewUrl && img.getAttribute("src") === item.previewUrl);
}

function describePath(composer, source, card) {
  const root = source.closest("[data-lexical-editor]");
  const editor = root?.__lexicalEditor;
  const editorKey = editor?.getKey?.();
  const nodeKey = editorKey && source["__lexicalKey_" + editorKey];
  if (!nodeKey || !composer.contains(root) || editor.getRootElement?.() !== root ||
      editor.getElementByKey?.(nodeKey) !== source) return null;
  const state = editor.getEditorState?.();
  const node = state?._nodeMap?.get(nodeKey);
  const pathReference = state?.read(() => node?.getType() === "reference-chip" &&
    node.getAppearance?.() === "file" ? node.getReference?.() : undefined);
  const name = card.querySelector("[data-wd-reference-name]")?.textContent;
  return typeof pathReference === "string" && name
    ? { kind: fileKind(name, false), name, nodeKey, pathReference, card }
    : null;
}

function nativeStatus(card) {
  if (card.hasAttribute("data-wd-attachment-image")) {
    if (card.querySelector('button[aria-busy="true"]')) return "uploading";
    return card.querySelector('[class*="_thumbnailFailed"]') ? "error" : undefined;
  }
  const meta = card.querySelector('[class$="_meta"], [class*="_meta "]');
  if (!meta || meta.hasAttribute("data-wd-attachment-summary")) return undefined;
  return meta.textContent?.trim();
}

export function createAttachmentComposer(ctx, language, references) {
  const sheet = document.createElement("style");
  sheet.dataset.whaleDream = "attachment-composer";
  sheet.textContent = style;
  document.head.append(sheet);
  const states = new Map();
  const controls = new Map();
  const events = new AbortController();
  let intake;
  let caretFrame = 0;
  const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };

  function composerInput(composer) {
    const sessionId = composer.closest("[data-conversation-session]")?.dataset.conversationSession;
    const session = sessionId && ctx.get("sessions")?.binding?.(sessionId);
    const conversation = ctx.get("conversation");
    const input = session && conversation?.input?.for?.(session.ctx);
    return { sessionId, conversation, input };
  }

  function textPoint(root, node, offset) {
    if (node?.nodeType !== 3 || !root.contains(node) || !node.parentElement?.hasAttribute("data-lexical-text")) return;
    return { node, offset, prefix: node.data.slice(0, offset) };
  }

  function retainedSelection(root, editor) {
    const selection = root.ownerDocument.getSelection();
    if (root.contains(selection?.anchorNode) && root.contains(selection.focusNode)) {
      return [textPoint(root, selection.anchorNode, selection.anchorOffset), textPoint(root, selection.focusNode, selection.focusOffset)];
    }
    const stored = editor.getEditorState()?._selection;
    const point = item => item?.type === "text" && textPoint(root, editor.getElementByKey(item.key)?.firstChild, item.offset);
    return [point(stored?.anchor), point(stored?.focus)];
  }

  function captureIntake(event) {
    const target = event.target;
    const composer = target?.closest?.("[data-composer-card]");
    if (!composer) return;
    if (event.type === "change") {
      if (!target.matches('input[type="file"]') || !target.files?.length) return;
    } else {
      const transfer = event.dataTransfer ?? event.clipboardData;
      if (!transfer?.files?.length && !Array.from(transfer?.items ?? []).some(item => item.kind === "file") &&
          !Array.from(transfer?.types ?? []).includes("Files")) return;
    }
    const { input } = composerInput(composer);
    const editor = input?.editor;
    const root = editor?.getRootElement();
    if (!root || !composer.contains(root) || !editor.isEditable() || editor.isComposing()) return;
    const key = "__lexicalKey_" + editor.getKey();
    const paths = new Set([...root.querySelectorAll("[data-composer-chip]")].map(chip => chip[key]).filter(Boolean));
    intake = { composer, input, root, paths, detached: new Set(references.listDraftPaths(composer).map(path => path.id)),
      ids: new Set(input.state.getSnapshot().attachmentIds),
      selection: retainedSelection(root, editor), expires: Date.now() + 2500 };
  }

  function cancelIntake() {
    intake = undefined;
    if (caretFrame) cancelAnimationFrame(caretFrame);
    caretFrame = 0;
  }

  function insertAtEmptyParagraph(event) {
    const root = event.target;
    if (event.defaultPrevented || !event.cancelable || event.isComposing || event.inputType !== "insertText" ||
        !event.data || !root?.matches?.('[data-composer-input][contenteditable="true"]')) return;
    const composer = root.closest("[data-composer-card]");
    const ui = controls.get(composer);
    const input = ui?.input;
    if (!ui?.count || typeof input.actions?.captureInsertion !== "function" || typeof input.actions.insertText !== "function" ||
        input.editor.isComposing() || input.state.getSnapshot().draft !== "") return;
    const selection = root.ownerDocument.getSelection();
    const paragraph = root.firstElementChild;
    if (!selection?.isCollapsed || selection.anchorNode !== paragraph || selection.anchorOffset !== 0 ||
        paragraph?.childNodes.length !== 1 || paragraph.firstChild.nodeName !== "BR") return;
    // Chromium can leave a painted caret next to Lexical's empty line break
    // after re-focusing an uploaded draft but decline to insert the first key.
    // Use the same guarded editor action as other native text insertions.
    const position = input.actions.captureInsertion();
    if (input.actions.insertText(event.data, position)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function restoreAfterIntake(composer, input, descriptors) {
    const ticket = intake;
    if (ticket?.composer !== composer || ticket.input !== input || caretFrame) return;
    if (Date.now() > ticket.expires) { cancelIntake(); return; }
    if (!descriptors.some(item => item.pathId ? !ticket.detached.has(item.pathId) :
      item.nodeKey ? !ticket.paths.has(item.nodeKey) : !ticket.ids.has(item.draftAttachmentId))) return;
    const { root, selection } = ticket;
    const owner = root.ownerDocument;
    const mayRestore = () => input.editor.getRootElement() === root && root.isConnected &&
      input.editor.isEditable() && !input.editor.isComposing() && !owner.hidden &&
      (owner.activeElement === owner.body || composer.contains(owner.activeElement));
    if (!mayRestore()) { cancelIntake(); return; }
    if (owner.activeElement !== root) input.focus();
    caretFrame = requestAnimationFrame(() => {
      caretFrame = 0;
      if (intake !== ticket) return;
      intake = undefined;
      if (!mayRestore() || owner.activeElement !== root) return;
      const native = owner.getSelection();
      const firstText = root.firstElementChild?.querySelector("[data-lexical-text]")?.firstChild;
      if (!root.innerText.trim() && firstText?.nodeType === 3) {
        // Native file chips leave a real separator. Anchor the caret at its
        // start so Chromium can paint it beside the hidden source chip.
        native?.setPosition(firstText, 0);
        return;
      }
      const pointStillExists = point => point && root.contains(point.node) && point.node.data.startsWith(point.prefix);
      const [anchor, focus] = selection;
      if (pointStillExists(anchor) && pointStillExists(focus)) {
        native?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      }
    });
  }

  const capture = { capture: true, signal: events.signal };
  for (const type of ["change", "drop", "paste"]) document.addEventListener(type, captureIntake, capture);
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, cancelIntake, capture);
  document.addEventListener("beforeinput", insertAtEmptyParagraph, capture);

  function releaseControls(composer) {
    const ui = controls.get(composer);
    if (!ui) return;
    ui.stop?.();
    if (ui.frame) cancelAnimationFrame(ui.frame);
    ui.anchor?.removeAttribute("data-wd-attached-placeholder");
    ui.original?.removeAttribute("data-wd-file-only-original");
    ui.send?.remove();
    controls.delete(composer);
  }

  function refreshControls(composer, ui) {
    const root = ui.input.editor.getRootElement();
    // DSH anchors its native placeholder to the editor's auto-grow parent.
    // The outer scrollport is static and resolves absolute insets to the card.
    const anchor = root?.parentElement;
    if (!anchor || !composer.contains(anchor) || !anchor.closest("[data-input-scroll]")) return;
    if (ui.anchor !== anchor) ui.anchor?.removeAttribute("data-wd-attached-placeholder");
    ui.anchor = anchor;
    const snapshot = ui.input.state.getSnapshot();
    const empty = snapshot.draft === "" && !snapshot.claim;
    const ready = root.getAttribute("contenteditable") === "true" && snapshot.phase === "plain";
    const hint = empty && ready && ui.count > 0 ? root.getAttribute("data-placeholder") || root.getAttribute("aria-label") : "";
    if (hint && anchor.getAttribute("data-wd-attached-placeholder") !== hint) anchor.setAttribute("data-wd-attached-placeholder", hint);
    else if (!hint) anchor.removeAttribute("data-wd-attached-placeholder");

    // DSH displays a disabled empty-draft Send button for local path-only drafts.
    // Keep native Stop and Retry intact and let the same shell admit path-only sends.
    const original = ready && references.hasOnlyDraftPaths(composer)
      ? [...composer.querySelectorAll('button[aria-busy="false"]:disabled')].at(-1) : undefined;
    if (ui.original === original && ui.send?.isConnected) return;
    ui.original?.removeAttribute("data-wd-file-only-original");
    ui.send?.remove();
    ui.original = original;
    ui.send = undefined;
    if (!original) return;
    const send = original.cloneNode(true);
    send.disabled = false;
    send.removeAttribute("id");
    send.setAttribute("data-wd-file-only-send", "");
    send.addEventListener("mousedown", event => event.preventDefault());
    send.addEventListener("click", () => references.submitOnlyPaths(composer));
    original.setAttribute("data-wd-file-only-original", "");
    original.after(send);
    ui.send = send;
  }

  function syncControls(composer, input, count) {
    let ui = controls.get(composer);
    if (!count) { releaseControls(composer); return; }
    if (ui?.input !== input) {
      releaseControls(composer);
      ui = { input, count };
      controls.set(composer, ui);
      ui.stop = input.state.subscribe(() => {
        if (ui.frame) return;
        ui.frame = requestAnimationFrame(() => { ui.frame = 0; refreshControls(composer, ui); });
      });
    }
    ui.count = count;
    refreshControls(composer, ui);
  }

  function collect(composer, rail, mirrors) {
    const { sessionId, conversation, input } = composerInput(composer);
    if (!input || typeof conversation?.resolveDraftAttachments !== "function") return null;
    const attachmentIds = input?.state?.getSnapshot()?.attachmentIds;
    if (!Array.isArray(attachmentIds)) return null;

    const sources = new Map([...mirrors].map(([node, view]) => [view.card, { node, path: view.path }]));
    const descriptors = [];
    const attachments = attachmentIds.length ? conversation.resolveDraftAttachments(attachmentIds) : [];
    if (attachments.length !== attachmentIds.length) return null;
    let index = 0;
    for (const item of rail?.children ?? []) {
      if (item.matches(pathCardSelector)) {
        const source = sources.get(item);
        const descriptor = source?.path ? {
          kind: fileKind(source.path.name, false), name: source.path.name, pathId: source.path.id,
          pathReference: source.path.pathReference, card: item,
        } : source && describePath(composer, source.node, item);
        if (!descriptor) return null;
        descriptors.push({ ...descriptor, wrapper: item });
        continue;
      }
      const card = item.matches(nativeCardSelector) ? item : item.firstElementChild;
      if (!card?.matches(nativeCardSelector)) continue;
      // The native AttachmentRail iterates resolved attachmentIds in order; prove
      // the kind and filename or preview source before trusting that position.
      const native = attachments[index];
      if (!native || native.id !== attachmentIds[index] || !matchingNativeCard(card, native)) return null;
      const name = native.file.name;
      descriptors.push({
        kind: fileKind(name, native.kind === "image"), name, draftAttachmentId: native.id, bytes: native.file.size,
        status: nativeStatus(card), card, wrapper: item,
      });
      index++;
    }
    return index === attachments.length ? { descriptors, sessionId, input } : null;
  }

  function removeView(card, view) {
    view.abort?.abort();
    view.wrapper?.style.removeProperty("--wd-draft-attachment-order");
    delete card.dataset.wdComposerNumbered;
    view.name.remove();
    view.meta.remove();
  }

  function makeView(composer, card) {
    const name = document.createElement("span");
    const meta = document.createElement("div");
    const number = document.createElement("button");
    const facts = document.createElement("span");
    name.dataset.wdComposerFileName = "";
    name.setAttribute("aria-hidden", "true");
    meta.dataset.wdComposerFileMeta = "";
    number.dataset.wdAttachmentNumber = "";
    number.type = "button";
    meta.append(number, facts);
    card.dataset.wdComposerNumbered = "";
    card.append(name, meta);
    const view = { name, meta, number, facts, key: undefined, path: undefined, abort: undefined, bytes: undefined, wrapper: undefined };
    number.addEventListener("mousedown", event => event.preventDefault());
    number.addEventListener("click", event => {
      event.stopPropagation();
      if (view.key) references.insert(composer, view.key);
    });
    return view;
  }

  function viewFacts(view, descriptor) {
    const suffix = extension(descriptor.name);
    const en = language() === "en";
    const status = descriptor.status === "uploading" ? (en ? "Uploading…" : "上传中…")
      : descriptor.status === "error" ? (en ? "Upload failed" : "上传失败")
      : descriptor.status;
    setText(view.facts, [suffix.toUpperCase(), status || formatAttachmentSize(descriptor.bytes ?? view.bytes)].filter(Boolean).join(" · "));
    if (view.facts.title !== view.facts.textContent) view.facts.title = view.facts.textContent;
  }

  function obtainPathSize(view, descriptor, sessionId, entry) {
    const path = referencePath(descriptor.pathReference).replaceAll("\\", "/");
    if (!path || path === view.path) return;
    view.abort?.abort();
    view.path = path;
    view.bytes = undefined;
    const abort = new AbortController();
    view.abort = abort;
    Promise.resolve().then(() => {
      if (abort.signal.aborted) return;
      const files = ctx.get("remote")?.workspaceFiles;
      return files?.stat?.(sessionId, path, abort.signal);
    }).then(result => {
      if (abort.signal.aborted || !result?.ok) return;
      view.bytes = result.value?.bytes;
      if (view.key === entry.key && Number.isSafeInteger(view.bytes) && view.bytes >= 0) entry.size = view.bytes;
      viewFacts(view, descriptor);
    }).catch(() => {});
  }

  function sync(composer, rail, mirrors) {
    const collected = collect(composer, rail, mirrors);
    const state = states.get(composer) ?? new Map();
    if (!collected) {
      // A host update can briefly put the DOM ahead of its input store. Never
      // interpret that as a user deleting attachments.
      for (const [card, view] of state) {
        if (rail?.contains(card)) continue;
        removeView(card, view);
        state.delete(card);
      }
      if (!state.size) states.delete(composer);
      return;
    }
    states.set(composer, state);
    const { descriptors, sessionId, input } = collected;
    const entries = references.trackComposer(composer, descriptors);
    const activeCards = new Set();
    descriptors.forEach((descriptor, index) => {
      const entry = entries?.[index];
      if (!entry?.key || !entry.label) return;
      const { card, name, wrapper } = descriptor;
      activeCards.add(card);
      const view = state.get(card) ?? makeView(composer, card);
      state.set(card, view);
      view.key = entry.key;
      if (view.wrapper !== wrapper) {
        view.wrapper?.style.removeProperty("--wd-draft-attachment-order");
        view.wrapper = wrapper;
      }
      const order = String(entry.number);
      if (wrapper.style.getPropertyValue("--wd-draft-attachment-order") !== order) {
        wrapper.style.setProperty("--wd-draft-attachment-order", order);
      }
      if (view.name.title !== name) view.name.title = name;
      const suffix = extension(name);
      setText(view.name, suffix ? name.slice(0, -suffix.length - 1) : name);
      setText(view.number, entry.label);
      const hint = language() === "en" ? `Insert ${entry.label} at the caret` : `在光标处引用 ${entry.label}`;
      if (view.number.title !== hint) {
        view.number.title = hint;
        view.number.setAttribute("aria-label", hint);
      }
      obtainPathSize(view, descriptor, sessionId, entry);
      viewFacts(view, descriptor);
    });
    for (const [card, view] of state) {
      if (activeCards.has(card)) continue;
      removeView(card, view);
      state.delete(card);
    }
    if (!state.size) states.delete(composer);
    syncControls(composer, input, descriptors.length);
    restoreAfterIntake(composer, input, descriptors);
  }

  function release(composer) {
    if (intake?.composer === composer) cancelIntake();
    releaseControls(composer);
    const state = states.get(composer);
    if (state) for (const [card, view] of state) removeView(card, view);
    states.delete(composer);
    references.releaseComposer(composer);
  }

  return { sync, release, dispose() {
    events.abort();
    cancelIntake();
    for (const composer of new Set([...states.keys(), ...controls.keys()])) release(composer);
    sheet.remove();
  } };
}
