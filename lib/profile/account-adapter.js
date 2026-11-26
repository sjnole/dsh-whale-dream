/**
 * Cosmetic adapter for DSH's native AccountMenu. It never owns the account
 * button, its React children, account credentials, or the native menu actions.
 *
 * Host contract verified against deepseek-ai/deepseek-harness, AccountMenu.tsx
 * at 4b399c39a6d1479cd84ca591b4d7c88e24d38a96. If that contract is absent, this
 * adapter does nothing. A settings.launcher replacement would lose host actions.
 */

const ACCOUNT_SELECTOR = 'button[data-collapsed][data-signed-out="false"][aria-haspopup="menu"]';
const SETTINGS_SELECTOR = '[data-shortcut-modal="settings"]';
const OWN_ATTRIBUTE = 'data-wd-account-decoration';
const OWN_SELECTOR = `[${OWN_ATTRIBUTE}]`;
const instances = new WeakMap();
const EMPTY_IDENTITY = Object.freeze({ name: '', avatarUrl: '' });

const STYLE = `
.wd-account-card {
  position:relative !important; isolation:isolate; box-sizing:border-box !important;
  display:flex !important; align-items:center !important; justify-content:flex-start !important;
  width:100% !important; min-width:0 !important; max-width:100% !important;
  height:44px !important; min-height:44px !important; flex:none !important;
  padding:4px !important; gap:8px !important; overflow:hidden !important;
  border-radius:8px !important; text-align:start;
}
.wd-account-card > [${OWN_ATTRIBUTE}] { pointer-events:none !important; user-select:none; }
.wd-account-background, .wd-account-shade { position:absolute; inset:0; overflow:hidden; border-radius:inherit; }
.wd-account-background { z-index:0; }
.wd-account-shade {
  z-index:1; background:linear-gradient(90deg,rgba(7,14,27,.25),rgba(7,14,27,.80) 30%,rgba(7,14,27,.48) 76%,rgba(7,14,27,.32));
}
.wd-account-native-avatar {
  position:relative !important; z-index:2; display:flex !important;
  align-items:center !important; justify-content:center !important;
  width:36px !important; height:36px !important; min-width:36px !important;
  flex:0 0 36px !important; border-radius:0 !important; overflow:hidden !important;
  background:rgba(31,48,70,.85);
  -webkit-mask-image:var(--wd-account-portrait-mask,radial-gradient(circle at 50% 50%,#000 0 31%,transparent 32%));
  mask-image:var(--wd-account-portrait-mask,radial-gradient(circle at 50% 50%,#000 0 31%,transparent 32%));
  -webkit-mask-size:100% 100%; mask-size:100% 100%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
}
.wd-account-native-avatar > img {
  display:block !important; width:100% !important; height:100% !important;
  object-fit:cover !important; border-radius:0 !important;
}
.wd-account-native-avatar > svg { width:16px; height:16px; }
.wd-account-native-label, .wd-account-custom-name {
  position:relative; z-index:2; flex:1 1 auto !important; min-width:0 !important;
  display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  color:#f3f6fc; line-height:1.4; text-shadow:0 1px 3px rgba(0,0,0,.65);
}
.wd-account-frame, .wd-account-custom-avatar {
  position:absolute; left:4px; top:4px; width:36px; height:36px; overflow:visible;
}
.wd-account-frame { z-index:4; }
.wd-account-custom-avatar {
  z-index:3; object-fit:cover;
  -webkit-mask-image:var(--wd-account-portrait-mask,radial-gradient(circle at 50% 50%,#000 0 31%,transparent 32%));
  mask-image:var(--wd-account-portrait-mask,radial-gradient(circle at 50% 50%,#000 0 31%,transparent 32%));
  -webkit-mask-size:100% 100%; mask-size:100% 100%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
}
.wd-account-custom-name { font:inherit; font-weight:inherit; text-align:inherit; }
.wd-account-avatar-overridden { visibility:hidden !important; }
.wd-account-name-overridden { display:none !important; }
.wd-account-card[data-collapsed="true"] {
  width:36px !important; min-width:36px !important; max-width:36px !important;
  height:36px !important; min-height:36px !important; padding:2px !important; gap:0 !important;
  border-radius:9px !important;
}
.wd-account-card[data-collapsed="true"] .wd-account-native-avatar {
  width:32px !important; min-width:32px !important; height:32px !important; flex-basis:32px !important;
}
.wd-account-card[data-collapsed="true"] .wd-account-frame,
.wd-account-card[data-collapsed="true"] .wd-account-custom-avatar {
  left:2px; top:2px; width:32px; height:32px;
}
.wd-account-card[data-collapsed="true"] .wd-account-native-label,
.wd-account-card[data-collapsed="true"] .wd-account-custom-name,
.wd-account-card[data-collapsed="true"] .wd-account-shade { display:none !important; }
`;

function originalChildren(button) {
  return [...button.children].filter(child => !child.hasAttribute(OWN_ATTRIBUTE));
}

function inspectAccount(button) {
  if (!button?.isConnected || !button.matches?.(ACCOUNT_SELECTOR)) return null;
  const collapsed = button.getAttribute('data-collapsed');
  if (collapsed !== 'true' && collapsed !== 'false') return null;
  const children = originalChildren(button);
  const avatar = children[0];
  // AccountAvatar can be an image, a fallback SVG, or an explicitly pending slot.
  if (avatar?.tagName !== 'SPAN' || (!avatar.hasAttribute('data-avatar-status') && !avatar.querySelector('img,svg'))) return null;
  const label = children[1] || null;
  if (collapsed === 'false' && (label?.tagName !== 'SPAN' || label.querySelector('button,a,input'))) return null;
  return { button, avatar, label, collapsed: collapsed === 'true' };
}

function normalizeProfile(value) {
  const profile = value && typeof value === 'object' ? value : {};
  const number = (input, fallback, min, max) => typeof input === 'number' && Number.isFinite(input)
    ? Math.max(min, Math.min(max, input)) : fallback;
  const themeId = typeof profile.themeId === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile.themeId)
    ? profile.themeId : '';
  return {
    enabled: profile.enabled === true && !!themeId,
    themeId,
    motion: ['auto', 'lite', 'off'].includes(profile.motion) ? profile.motion : 'auto',
    backgroundX: number(profile.backgroundX, 50, 0, 100),
    backgroundZoom: number(profile.backgroundZoom, 1, 1, 1.8),
    displayName: typeof profile.displayName === 'string' ? profile.displayName.trim().slice(0, 100) : '',
    avatar: typeof profile.avatar === 'string' && profile.avatar.length <= 8 * 1024 * 1024 &&
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(profile.avatar)
      ? profile.avatar : '',
  };
}

/**
 * @param {object} options
 * @param {(container: HTMLElement, options: object) => {update?: Function, dispose: Function}} options.createScene
 * @param {(container: HTMLElement, options: object) => {update?: Function, dispose: Function}} options.createFrame
 * @param {(themeId: string, file: string) => string} options.assetUrl
 * @param {() => object} options.readProfile
 * @param {(listener: Function) => Function} [options.subscribe]
 * @param {(identity: {name: string, avatarUrl: string}) => void} [options.onIdentityChange]
 */
export function mountAccountAdapter(options = {}) {
  const doc = options.document || globalThis.document;
  const win = doc?.defaultView || globalThis;
  if (!doc?.querySelectorAll) return {
    dispose() {}, refresh() {}, getIdentity: () => ({ ...EMPTY_IDENTITY }),
    getStatus: () => ({ state: 'unavailable', targets: 0, collapsed: 0, scans: 0, updates: 0, lastError: '' }),
  };
  instances.get(doc)?.dispose();

  const records = new Map();
  let nativeNames = new WeakMap();
  const cleanups = [];
  const status = { state: 'waiting', scans: 0, updates: 0, lastError: '' };
  let disposed = false;
  let observer;
  let scheduled;
  let style;
  let identity = { ...EMPTY_IDENTITY };
  let knownSignedOut = false;
  let identityButton = null;

  const noteError = code => { status.lastError = code; };
  const release = handle => {
    try { handle?.dispose?.(); } catch { noteError('media-dispose-failed'); }
  };
  const rememberCleanup = value => {
    if (typeof value === 'function') cleanups.push(value);
    else if (value && typeof value.dispose === 'function') cleanups.push(() => value.dispose());
  };
  const addClass = (record, node, name) => {
    if (!node || node.classList.contains(name)) return;
    node.classList.add(name);
    record.classes.push([node, name]);
  };
  const removeClass = (record, node, name) => {
    const index = record.classes.findIndex(item => item[0] === node && item[1] === name);
    if (index < 0) return;
    node.classList.remove(name);
    record.classes.splice(index, 1);
  };
  const owned = (tag, className) => {
    const element = doc.createElement(tag);
    element.setAttribute(OWN_ATTRIBUTE, '');
    element.setAttribute('aria-hidden', 'true');
    element.className = className;
    return element;
  };
  const isOwned = node => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return !!element?.closest?.(OWN_SELECTOR);
  };
  const cancelMask = record => {
    if (!record.maskImage) return;
    record.maskImage.onload = record.maskImage.onerror = null;
    record.maskImage.removeAttribute('src');
    record.maskImage = null;
  };
  const clearCustomAvatar = record => {
    if (record.customAvatar) {
      record.customAvatar.onload = record.customAvatar.onerror = null;
      record.customAvatar.remove();
      record.customAvatar = null;
    }
    removeClass(record, record.avatar, 'wd-account-avatar-overridden');
  };
  const unmount = record => {
    if (!record.alive) return;
    record.alive = false;
    release(record.scene);
    release(record.frame);
    cancelMask(record);
    clearCustomAvatar(record);
    record.customName?.remove();
    record.background?.remove();
    record.shade.remove();
    record.frameNode.remove();
    for (const [node, name] of record.classes) node.classList.remove(name);
    if (record.maskApplied === record.button.style.getPropertyValue('--wd-account-portrait-mask')) {
      if (record.previousMask) record.button.style.setProperty('--wd-account-portrait-mask', record.previousMask, record.previousMaskPriority);
      else record.button.style.removeProperty('--wd-account-portrait-mask');
    }
    records.delete(record.button);
  };

  const mediaOptions = (profile, settingsOpen) => ({
    themeId: profile.themeId, motion: settingsOpen ? 'off' : profile.motion,
    size: 'compact', backgroundX: profile.backgroundX, backgroundZoom: profile.backgroundZoom,
  });

  function setMask(record, themeId) {
    if (record.maskTheme === themeId) return;
    record.maskTheme = themeId;
    cancelMask(record);
    // Keep an opaque portrait opening until the real mask is decoded. A missing
    // resource must never turn the user's avatar invisible.
    if (record.maskApplied === record.button.style.getPropertyValue('--wd-account-portrait-mask')) {
      record.button.style.removeProperty('--wd-account-portrait-mask');
      record.maskApplied = '';
    }
    let url;
    try { url = options.assetUrl?.(themeId, 'portrait-mask.png'); }
    catch { noteError('portrait-mask-url-failed'); return; }
    if (typeof url !== 'string' || !url || !win.Image) return;
    const image = new win.Image();
    record.maskImage = image;
    image.onload = () => {
      if (disposed || !record.alive || record.maskImage !== image) return;
      const value = `url(${JSON.stringify(url)})`;
      record.button.style.setProperty('--wd-account-portrait-mask', value);
      record.maskApplied = record.button.style.getPropertyValue('--wd-account-portrait-mask');
    };
    image.onerror = () => { if (record.alive) noteError('portrait-mask-load-failed'); };
    image.src = url;
  }

  function setCustomIdentity(record, profile) {
    if (!profile.displayName || record.collapsed) {
      record.customName?.remove();
      record.customName = null;
      removeClass(record, record.label, 'wd-account-name-overridden');
    } else {
      if (!record.customName) {
        record.customName = owned('span', 'wd-account-custom-name');
        record.button.append(record.customName);
      }
      if (record.customName.textContent !== profile.displayName) record.customName.textContent = profile.displayName;
      addClass(record, record.label, 'wd-account-name-overridden');
    }
    if (!profile.avatar) {
      clearCustomAvatar(record);
      record.failedAvatar = '';
    } else if (record.customAvatar?.getAttribute('src') !== profile.avatar && record.failedAvatar !== profile.avatar) {
      clearCustomAvatar(record);
      const image = owned('img', 'wd-account-custom-avatar');
      image.alt = '';
      image.decoding = 'async';
      record.customAvatar = image;
      image.onload = () => {
        if (!disposed && record.alive && record.customAvatar === image) addClass(record, record.avatar, 'wd-account-avatar-overridden');
      };
      image.onerror = () => {
        if (!record.alive || record.customAvatar !== image) return;
        record.failedAvatar = profile.avatar;
        clearCustomAvatar(record);
        noteError('custom-avatar-load-failed');
      };
      image.src = profile.avatar;
      record.button.append(image);
    }
  }

  function mount(target) {
    const record = {
      ...target, alive: true, classes: [], scene: null, frame: null,
      background: null, shade: owned('span', 'wd-account-shade'),
      frameNode: owned('span', 'wd-account-frame'), customName: null, customAvatar: null,
      maskTheme: '', maskImage: null, maskApplied: '', sceneKey: '', frameKey: '', failedAvatar: '',
      previousMask: target.button.style.getPropertyValue('--wd-account-portrait-mask'),
      previousMaskPriority: target.button.style.getPropertyPriority('--wd-account-portrait-mask'),
    };
    records.set(target.button, record);
    addClass(record, target.button, 'wd-account-card');
    addClass(record, target.avatar, 'wd-account-native-avatar');
    addClass(record, target.label, 'wd-account-native-label');
    target.button.append(record.shade, record.frameNode);
    return record;
  }

  function update(record, target, profile, settingsOpen) {
    record.collapsed = target.collapsed;
    const config = mediaOptions(profile, settingsOpen);
    const key = JSON.stringify(config);
    if (record.collapsed) {
      release(record.scene);
      record.scene = null;
      record.sceneKey = '';
      record.background?.remove();
      record.background = null;
    } else if (!record.scene) {
      record.background = owned('span', 'wd-account-background');
      record.button.append(record.background);
      record.scene = options.createScene(record.background, config);
      if (!record.scene || typeof record.scene.dispose !== 'function') throw new Error('Invalid scene handle');
      record.sceneKey = key;
    } else if (record.sceneKey !== key) {
      record.scene.update?.(config);
      record.sceneKey = key;
    }
    if (!record.frame) {
      record.frame = options.createFrame(record.frameNode, config);
      if (!record.frame || typeof record.frame.dispose !== 'function') throw new Error('Invalid frame handle');
      record.frameKey = key;
    } else if (record.frameKey !== key) {
      record.frame.update?.(config);
      record.frameKey = key;
    }
    setMask(record, profile.themeId);
    setCustomIdentity(record, profile);
    status.updates++;
  }

  function identityFor(target) {
    if (!target || knownSignedOut) return { ...EMPTY_IDENTITY };
    const image = target.avatar.querySelector('img');
    // The host intentionally removes the name span in its collapsed rail. Keep
    // the last observed real name for this same signed-in button, never a demo.
    if (!target.collapsed) nativeNames.set(target.button, target.label?.textContent?.trim() || '');
    return {
      name: target.label?.textContent?.trim() || nativeNames.get(target.button) || '',
      avatarUrl: image?.currentSrc || image?.getAttribute('src') || '',
    };
  }

  function publishIdentity(next) {
    if (next.name === identity.name && next.avatarUrl === identity.avatarUrl) return;
    identity = next;
    try { options.onIdentityChange?.({ ...identity }); }
    catch { noteError('identity-callback-failed'); }
  }

  function sync() {
    scheduled = undefined;
    if (disposed || !doc.body) return;
    status.scans++;
    const targets = [...doc.querySelectorAll(ACCOUNT_SELECTOR)].map(inspectAccount).filter(Boolean);
    if (!targets.length) nativeNames = new WeakMap();
    const identityTarget = targets.find(target => !target.collapsed) || targets[0] || null;
    identityButton = identityTarget?.button || null;
    publishIdentity(identityFor(identityTarget));
    let profile;
    try { profile = normalizeProfile(options.readProfile?.()); }
    catch { profile = normalizeProfile(null); noteError('profile-read-failed'); }
    const active = profile.enabled && !knownSignedOut && typeof options.createScene === 'function' && typeof options.createFrame === 'function';
    const targetMap = new Map(targets.map(target => [target.button, target]));
    for (const record of records.values()) {
      const target = targetMap.get(record.button);
      if (!active || !target || target.avatar !== record.avatar || target.label !== record.label) unmount(record);
    }
    if (active) {
      const settingsOpen = !!doc.querySelector(SETTINGS_SELECTOR);
      for (const target of targets) {
        const record = records.get(target.button) || mount(target);
        try { update(record, target, profile, settingsOpen); }
        catch { noteError('account-media-update-failed'); unmount(record); }
      }
    }
    status.state = !profile.enabled ? 'disabled' : knownSignedOut ? 'signed-out' : records.size ? 'mounted' : 'unavailable';
  }

  function schedule() {
    if (disposed || scheduled !== undefined) return;
    scheduled = typeof win.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame(sync) : win.setTimeout(sync, 16);
  }

  function hasRelevantNode(node) {
    if (node?.nodeType !== 1 || isOwned(node)) return false;
    return node.matches(ACCOUNT_SELECTOR) || node.matches(SETTINGS_SELECTOR) ||
      !!node.querySelector(`${ACCOUNT_SELECTOR},${SETTINGS_SELECTOR}`);
  }

  function containsAccountNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return false;
    if (identityButton && (identityButton === element || identityButton.contains(element))) return true;
    for (const record of records.values()) {
      if (record.button === element || record.button.contains(element)) return true;
    }
    return false;
  }

  function observe(mutations) {
    for (const mutation of mutations) {
      if (isOwned(mutation.target)) continue;
      if (mutation.type === 'attributes') {
        const element = mutation.target;
        if (mutation.attributeName === 'data-signed-out') nativeNames.delete(element);
        if (records.has(element) || element.matches?.(ACCOUNT_SELECTOR) || containsAccountNode(element)) { schedule(); return; }
      } else if (mutation.type === 'characterData') {
        // 流式回复会持续改写正文文本；只有落在账号按钮内的文本才需要重扫。
        if (containsAccountNode(mutation.target)) { schedule(); return; }
      } else {
        const changed = [...mutation.addedNodes || [], ...mutation.removedNodes || []];
        if (changed.length && changed.every(isOwned)) continue;
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target?.closest?.(ACCOUNT_SELECTOR) || target?.closest?.(SETTINGS_SELECTOR)) { schedule(); return; }
        let stale = false;
        for (const button of records.keys()) { if (!button.isConnected) { stale = true; break; } }
        if (stale) { schedule(); return; }
        // 会话正文不承载账号卡或设置面板，跳过对每个新增节点的选择器扫描。
        if (target?.closest?.('[data-conversation-content]')) continue;
        if (changed.some(hasRelevantNode)) { schedule(); return; }
      }
    }
  }

  function readAccountState(state, reset = false) {
    const value = state?.view?.status;
    knownSignedOut = (typeof value === 'string' || reset === true) && value !== 'credential-stored';
    if (knownSignedOut) {
      nativeNames = new WeakMap();
      identityButton = null;
      for (const record of records.values()) unmount(record);
      publishIdentity({ ...EMPTY_IDENTITY });
    }
    schedule();
  }

  function start() {
    if (disposed || !doc.body) return;
    style = doc.createElement('style');
    style.setAttribute('data-wd-account-style', '');
    style.textContent = STYLE;
    (doc.head || doc.documentElement).append(style);
    if (win.MutationObserver) {
      observer = new win.MutationObserver(observe);
      observer.observe(doc.body, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['data-signed-out', 'data-collapsed', 'data-avatar-status', 'src', 'srcset'],
      });
    }
    try { rememberCleanup(options.subscribe?.(schedule)); }
    catch { noteError('profile-subscribe-failed'); }
    try {
      const service = options.ctx?.get?.('accountUi');
      if (service?.getSnapshot) readAccountState(service.getSnapshot());
    } catch { /* The optional host service is unavailable in older DSH builds. */ }
    try { rememberCleanup(options.ctx?.on?.('account-ui/change', readAccountState)); }
    catch { /* Exact native DOM markers remain the compatibility boundary. */ }
    schedule();
  }

  const api = {
    refresh: schedule,
    getIdentity() {
      if (disposed) return { ...EMPTY_IDENTITY };
      const targets = [...doc.querySelectorAll(ACCOUNT_SELECTOR)].map(inspectAccount).filter(Boolean);
      return identityFor(targets.find(target => !target.collapsed) || targets[0]);
    },
    getStatus() {
      return { ...status, targets: records.size, collapsed: [...records.values()].filter(record => record.collapsed).length };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      if (scheduled !== undefined) {
        if (typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(scheduled);
        else win.clearTimeout(scheduled);
        scheduled = undefined;
      }
      doc.removeEventListener('DOMContentLoaded', start);
      for (const cleanup of cleanups.splice(0)) {
        try { cleanup(); } catch { noteError('subscription-dispose-failed'); }
      }
      for (const record of records.values()) unmount(record);
      style?.remove();
      status.state = 'disposed';
      if (instances.get(doc) === api) instances.delete(doc);
    },
  };
  instances.set(doc, api);
  if (doc.body) start();
  else doc.addEventListener('DOMContentLoaded', start, { once: true });
  return api;
}
