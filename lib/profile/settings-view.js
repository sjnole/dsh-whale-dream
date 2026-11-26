const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const CATEGORY_NAMES = { animal: '海洋生物', game: '游戏', plant: '植物', celestial: '星空与光影', 'micro-world': '微缩世界', companion: '机械伙伴', showcase: '演出小游戏' };
export const OCEAN_KEY = 'dsh-whale-dream:ocean:v1';
const SKIN_KEY = 'dsh-dream-skin:skin';
const INFO_BASE = '/_dsh/whale-dream-info';

const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

/* ============ 主题：读取「外观与动态」实际写入的 ocean 配置 ============ */
let oceanRawCache;
let oceanIdCache = '';
export function readOceanAppearanceId() {
  try {
    const raw = globalThis.localStorage?.getItem(OCEAN_KEY);
    // 同一份 JSON 被多个计时器反复读取时只解析一次。
    if (raw === oceanRawCache) return oceanIdCache;
    if (typeof raw !== 'string' || !raw) { oceanRawCache = undefined; oceanIdCache = ''; return ''; }
    oceanRawCache = raw;
    const parsed = JSON.parse(raw);
    const id = parsed?.appearanceId;
    oceanIdCache = typeof id === 'string' ? id : '';
    return oceanIdCache;
  } catch { oceanRawCache = undefined; oceanIdCache = ''; return ''; }
}

export function readThemeId(ctx, validIds) {
  const valid = id => typeof id === 'string' && id.length > 0 && (!validIds || validIds.has(id));
  // 1. 「外观与动态」页真正写入的位置
  const ocean = readOceanAppearanceId();
  if (valid(ocean) && (!validIds || validIds.has(ocean))) return ocean;
  // 2. 主题配色页写入的皮肤键（仅当它确实是套装 id 时采用）
  try {
    const skin = globalThis.localStorage?.getItem(SKIN_KEY);
    if (valid(skin) && validIds?.has(skin)) return skin;
  } catch {}
  // 3. DSH 当前主题偏好（仅当它确实是套装 id 时采用）
  try {
    const pref = ctx?.theme?.getTheme?.()?.preference;
    if (valid(pref) && validIds?.has(pref)) return pref;
  } catch {}
  return '';
}

/* ============ 用量：与底部信息栏同一 RPC ============ */
function resolveIdentity(ctx) {
  const pick = value => {
    const provider = typeof value?.provider === 'string' ? value.provider.trim() : '';
    const model = typeof value?.model === 'string' ? value.model.trim() : '';
    return provider && model ? { provider, model } : null;
  };
  try {
    const sessions = ctx?.get?.('sessions');
    const snap = sessions?.list?.getSnapshot?.();
    const catalog = snap?.byId ?? {};
    const ids = Array.isArray(snap?.ids) ? snap.ids : Object.keys(catalog);
    const eligible = id => Object.hasOwn(catalog, id) && catalog[id]?.origin !== 'subagent';
    const id = ids.filter(eligible).find(key => catalog[key]?.retainedBy?.mainView > 0) || ids.filter(eligible)[0] || '';
    if (!id) return null;
    const models = ctx?.get?.('modelDirectories');
    let current = null;
    try { current = models?.directoryFor?.(id)?.store?.getSnapshot?.()?.current; } catch {}
    let route = pick(current);
    if (!route) {
      const row = catalog[id];
      const projection = snap?.projectionsBySession?.[id]?.values?.modelSelection ?? row?.projectionValues?.modelSelection;
      const catalogValue = models?.catalog?.store?.getSnapshot?.()?.value;
      route = pick(projection?.next) || pick(catalogValue?.default) || pick(projection?.lastUsed);
    }
    return route ? { sessionId: id, provider: route.provider, model: route.model } : null;
  } catch {
    return null;
  }
}

/* ============ 统计范围：读取 DSH 模型设置里的 API 与模型 ============ */
function readModelChoices(ctx) {
  try {
    const directories = ctx?.get?.('modelDirectories');
    const sessions = ctx?.get?.('sessions');
    const snap = sessions?.list?.getSnapshot?.();
    const catalog = snap?.byId ?? {};
    const ids = Array.isArray(snap?.ids) ? snap.ids : Object.keys(catalog);
    const eligible = ids.filter(id => catalog[id]?.origin !== 'subagent');
    const id = eligible.find(key => catalog[key]?.retainedBy?.mainView > 0) || eligible[0] || '';
    const value = directories?.directoryFor?.(id)?.store?.getSnapshot?.();
    const groups = Array.isArray(value?.groups) ? value.groups : [];
    const seen = new Set();
    return groups.flatMap(group => (Array.isArray(group?.models) ? group.models : []).flatMap(model => {
      const provider = typeof group?.id === 'string' ? group.id : '';
      const modelId = typeof model?.id === 'string' ? model.id : '';
      if (!provider || !modelId) return [];
      const key = provider + '/' + modelId;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        key, provider, model: modelId,
        providerName: typeof group?.name === 'string' && group.name ? group.name : provider,
        modelName: typeof model?.name === 'string' && model.name ? model.name : modelId,
      }];
    }));
  } catch { return []; }
}

/* 统计范围默认值：DSH 模型目录的默认模型优先，其次第一个模型。 */
function pickDefaultChoice(ctx, choices) {
  if (!Array.isArray(choices) || !choices.length) return null;
  try {
    const directories = ctx?.get?.('modelDirectories');
    const fallback = directories?.catalog?.store?.getSnapshot?.()?.value?.default;
    const match = choices.find(item => item.provider === fallback?.provider && item.model === fallback?.model);
    if (match) return match;
  } catch {}
  return choices[0];
}

/* 最近 30 天用量最多的模型 → 目录里的统计范围。账本里的 provider / model 可能与目录
   使用不同别名（deepseek-account / deepseek-flash 等），先精确后按家族名匹配。 */
function pickTopChoice(choices, top) {
  if (!Array.isArray(choices) || !choices.length || !top) return null;
  const provider = typeof top.provider === 'string' ? top.provider : '';
  const model = typeof top.model === 'string' ? top.model : '';
  if (!provider && !model) return null;
  const family = value => {
    const text = String(value || '').toLowerCase();
    if (text.includes('flash')) return 'flash';
    if (text.includes('pro')) return 'pro';
    if (text.includes('coder')) return 'coder';
    if (text.includes('reasoner')) return 'reasoner';
    return text.replace(/[^a-z0-9]/g, '');
  };
  const target = family(model);
  const exact = choices.find(item => item.provider === provider && item.model === model);
  if (exact) return exact;
  const sameProvider = choices.filter(item => item.provider === provider);
  const sameFamily = sameProvider.find(item => target && family(item.model) === target);
  if (sameFamily) return sameFamily;
  const aliasProvider = choices.filter(item => {
    const a = String(item.provider || '').toLowerCase();
    const b = String(provider || '').toLowerCase();
    return a && b && (a.startsWith(b) || b.startsWith(a));
  });
  const aliasFamily = aliasProvider.find(item => target && family(item.model) === target);
  if (aliasFamily) return aliasFamily;
  return choices.find(item => target && family(item.model) === target) || null;
}

/* TAB 标签用短名称：去掉与 API 同品牌的模型名前缀，避免标签过长导致横向滚动过远。 */
function modelTabLabel(item) {
  const name = String(item?.modelName || item?.model || '').trim();
  const brand = String(item?.providerName || item?.provider || '').split(/[\s·/]+/).filter(Boolean)[0]?.toLowerCase() || '';
  if (brand && name.toLowerCase().startsWith(brand)) {
    const rest = name.slice(brand.length).replace(/^[\s\-_·/]+/, '').trim();
    if (rest) return rest;
  }
  return name;
}

/* 每个 API + 模型一个 TAB；短名重复时补上 API 名称以便区分。 */
function modelTabs(choices) {
  if (!Array.isArray(choices) || !choices.length) return [];
  const counts = new Map();
  for (const item of choices) {
    const label = modelTabLabel(item).toLowerCase();
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return choices.map(item => {
    const short = modelTabLabel(item);
    const duplicated = (counts.get(short.toLowerCase()) || 0) > 1;
    return {
      key: item.key,
      label: duplicated ? item.providerName + ' · ' + short : short,
      title: item.providerName + ' · ' + item.modelName,
    };
  });
}

async function infoRequest(method, args) {
  const response = await fetch(`${INFO_BASE}/${method}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args || {}),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '未授权，请重新连接 DSH。' : `信息服务暂不可用（${response.status}）`);
  return response.json();
}

/* ============ 格式化 ============ */
function formatMoney(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : (typeof currency === 'string' && currency ? currency + ' ' : '');
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return symbol + value.toFixed(digits);
}
function localDayKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function clockText(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}
function formatTokens(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number >= 1e8) return (number / 1e8).toFixed(2) + '亿';
  if (number >= 1e4) return (number / 1e4).toFixed(2) + '万';
  if (number >= 1e3) return (number / 1e3).toFixed(1) + 'K';
  return String(Math.round(number));
}
function numberText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}
function amountItems(total) {
  return (Array.isArray(total?.amounts) ? total.amounts : []).filter(item => Number.isFinite(Number(item?.amount)) && typeof item?.currency === 'string');
}
function amountText(total) {
  if (!total) return '—';
  const items = amountItems(total);
  if (items.length) return items.map(item => formatMoney(item.amount, item.currency)).join(' + ');
  const tokens = Number(total.tokens) || 0;
  if ((Number(total.unpricedRecords) || 0) > 0 || tokens > 0) return formatTokens(tokens) + ' token · 未计价';
  if (total.recordCount === 0) return '暂无记录';
  return '—';
}
export async function validateAvatarFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error('头像图片需大于 0 字节且不超过 5 MB。');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw new Error('图片内容与格式不符，请重新导出为 PNG、JPEG 或 WebP。');
  return true;
}

export async function prepareAvatar(file) {
  await validateAvatarFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('图片无法读取，请换一张图片。')); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 36e6) throw new Error('图片像素过大，请先缩小到 3600 万像素以内。');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前窗口无法处理图片，请稍后重试。');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    const data = canvas.toDataURL('image/png');
    if (!data.startsWith('data:image/png;base64,')) throw new Error('头像处理失败，请重试。');
    return data;
  } finally { URL.revokeObjectURL(url); }
}

export function createProfileSettings(React, { store, media, catalog, adapter, ctx }) {
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo, useSyncExternalStore } = React;
  const themes = Array.isArray(catalog.themes) ? catalog.themes : [];
  const assetUrl = (id, file) => media.assetUrl(id, file);
  const safeAvatar = value => typeof value === 'string' && /^(?:data:image\/(?:png|jpeg|webp);base64,|https?:\/\/|blob:|\/)/i.test(value) ? value : '';

  function MediaLayer({ kind, options }) {
    const node = useRef(null), player = useRef(null);
    useEffect(() => {
      if (!node.current) return;
      player.current = kind === 'frame' ? media.createFrame(node.current, options) : media.createScene(node.current, options);
      return () => { player.current?.dispose(); player.current = null; };
    }, [kind]);
    useEffect(() => { player.current?.update(options); }, [options.themeId, options.motion, options.size, options.backgroundX, options.backgroundZoom, options.showSubject]);
    return h('div', { ref: node, className: kind === 'frame' ? 'wdp-frame-media' : 'wdp-scene-media', 'aria-hidden': true });
  }

  function ProfileSettings() {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const [editing, setEditing] = useState(false), [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false), [avatarBusy, setAvatarBusy] = useState(false);
    const [notice, setNotice] = useState(''), [error, setError] = useState('');
    const [usage, setUsage] = useState({ loading: true, data: null, error: '', identity: null, updatedAt: 0 });
    const [history, setHistory] = useState({ loading: true, points: [], sinceTs: null, error: '' });
    const [month, setMonth] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
    const [models, setModels] = useState({ loading: false, list: [], error: '', monthKey: '' });
    const [modelScope, setModelScope] = useState({ loading: false, data: null, error: '' });
    const [choices, setChoices] = useState(() => readModelChoices(ctx));
    const [scope, setScope] = useState(null);
    const tabNodes = useRef({});
    const tabStrip = useRef(null);
    const themeIds = useMemo(() => new Set(themes.map(item => item.id)), [themes]);
    const [skinId, setSkinId] = useState(() => readThemeId(ctx, themeIds));
    const uploadSequence = useRef(0), alive = useRef(true), editor = useRef(null), usageSequence = useRef(0), modelsSequence = useRef(0);
    const trendCache = useRef({ key: '', at: 0 });
    useEffect(() => { alive.current = true; return () => { alive.current = false; uploadSequence.current++; usageSequence.current++; }; }, []);

    /* ---- 主题跟随「外观与动态」 ---- */
    useEffect(() => {
      const sync = () => setSkinId(current => { const next = readThemeId(ctx, themeIds); return next === current ? current : next; });
      sync();
      let off;
      try { off = ctx?.on?.('theme/change', sync); } catch {}
      const timer = setInterval(sync, 1000);
      const onStorage = event => { if (!event?.key || event.key === OCEAN_KEY || event.key.startsWith('dsh-dream-skin')) sync(); };
      try { globalThis.addEventListener?.('storage', onStorage); } catch {}
      return () => {
        try { if (typeof off === 'function') off(); } catch {}
        clearInterval(timer);
        try { globalThis.removeEventListener?.('storage', onStorage); } catch {}
      };
    }, []);

    /* ---- 用量数据 ---- */
    async function loadUsage(force) {
      const sequence = ++usageSequence.current;
      const identity = scope
        ? { sessionId: resolveIdentity(ctx)?.sessionId || '', provider: scope.provider, model: scope.model }
        : resolveIdentity(ctx);
      // 快照负责六格汇总；日历另取约 13 个月的日桶，供年月切换使用。
      const snapshotJob = infoRequest('getSnapshot', {
        sessionId: identity?.sessionId || '',
        selection: identity ? { provider: identity.provider, model: identity.model } : undefined,
        force: force !== false,
      });
      // 历史日桶来自账本扫描，变化很慢：只在首次、切换统计范围或超过 2 分钟时重取。
      const scopeKey = identity ? `${identity.provider}/${identity.model}` : 'default';
      const wantTrend = !!identity && (force === true || trendCache.current.key !== scopeKey || Date.now() - trendCache.current.at >= 120000);
      const trendJob = wantTrend
        ? infoRequest('getTrend', {
            sessionId: identity.sessionId || '',
            selection: { provider: identity.provider, model: identity.model },
            days: 370,
          })
        : Promise.resolve(null);
      const [snapshotResult, trendResult] = await Promise.allSettled([snapshotJob, trendJob]);
      if (!alive.current || usageSequence.current !== sequence) return;
      if (trendResult.status === 'fulfilled' && trendResult.value) {
        const value = trendResult.value;
        trendCache.current = { key: scopeKey, at: Date.now() };
        setHistory({
          loading: false,
          points: Array.isArray(value.points) ? value.points : [],
          sinceTs: Number.isFinite(Number(value.sinceTs)) ? Number(value.sinceTs) : null,
          error: '',
        });
      } else {
        setHistory(current => ({
          ...current, loading: false,
          error: trendResult.status === 'rejected' ? String(trendResult.reason?.message || '读取历史用量失败') : '',
        }));
      }
      if (snapshotResult.status === 'fulfilled') {
        setUsage({ loading: false, data: snapshotResult.value, error: '', identity, updatedAt: Date.now() });
      } else {
        setUsage(current => ({
          ...current, loading: false,
          error: snapshotResult.reason?.message || '读取用量失败', identity,
        }));
      }
    }
    useEffect(() => {
      let stopped = false;
      let lastRun = 0;
      const tick = force => {
        if (stopped) return;
        if (force) { lastRun = Date.now(); void loadUsage(true); return; }
        // 聚焦、回到前台和定时器可能同时触发；15 秒内的重复请求合并为一次。
        const now = Date.now();
        if (now - lastRun < 15000) return;
        lastRun = now;
        void loadUsage(false);
      };
      tick(true);
      // 页面可见时每 60 秒静默刷新；切到后台暂停，回到前台最多补一次。
      const timer = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        tick(false);
      }, 60000);
      const onVisible = () => { if (document.visibilityState === 'visible') tick(false); };
      const onFocus = () => tick(false);
      document.addEventListener?.('visibilitychange', onVisible);
      globalThis.addEventListener?.('focus', onFocus);
      return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener?.('visibilitychange', onVisible);
        globalThis.removeEventListener?.('focus', onFocus);
      };
    }, [scope?.provider, scope?.model]);

    /* ---- 模型目录常驻检测：DSH 新增模型时自动补 TAB，隐藏时暂停 ---- */
    useEffect(() => {
      let stopped = false;
      const sync = () => {
        if (stopped) return;
        const next = readModelChoices(ctx);
        if (!next.length) return;
        setChoices(current => {
          if (current.length === next.length && next.every((item, index) => item.key === current[index].key)) return current;
          return next;
        });
      };
      const timer = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        sync();
      }, 5000);
      const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
      document.addEventListener?.('visibilitychange', onVisible);
      return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener?.('visibilitychange', onVisible);
      };
    }, []);

    /* ---- 统计范围默认取最近 30 天用量最多的模型，不跟随会话 ---- */
    useEffect(() => {
      if (scope || !choices.length) return;
      let cancelled = false;
      const fallback = () => {
        if (cancelled) return;
        const initial = pickDefaultChoice(ctx, choices);
        if (initial) setScope(current => current || initial);
      };
      (async () => {
        for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
          try {
            const value = await infoRequest('getTopModel', { days: 30 });
            if (cancelled) return;
            if (value?.status === 'loading') {
              await new Promise(resolve => setTimeout(resolve, 600));
              continue;
            }
            if (value?.status === 'ready') {
              const picked = pickTopChoice(choices, value);
              if (picked) { setScope(current => current || picked); return; }
            }
            break;
          } catch { break; }
        }
        fallback();
      })();
      return () => { cancelled = true; };
    }, [choices, scope]);

    /* ---- 统计范围 TAB：短标签、自动把选中项滚进可视区 ---- */
    const tabs = useMemo(() => modelTabs(choices), [choices]);
    useEffect(() => {
      const node = scope?.key ? tabNodes.current[scope.key] : null;
      if (!node) return;
      try {
        const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        node.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      } catch {}
    }, [scope?.key, tabs.length]);
    // 模型较多时标签行可横向滚动：鼠标滚轮在标签行上转为左右滚动。
    useEffect(() => {
      const node = tabStrip.current;
      if (!node) return;
      const onWheel = event => {
        if (node.scrollWidth <= node.clientWidth + 1) return;
        if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        node.scrollLeft += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
        event.preventDefault();
      };
      node.addEventListener('wheel', onWheel, { passive: false });
      return () => node.removeEventListener('wheel', onWheel);
    }, [tabs.length]);
    // 目录里移除了正在使用的模型时，回退到可用默认值，避免一直显示空统计。
    useEffect(() => {
      if (!scope || !choices.length) return;
      if (choices.some(item => item.key === scope.key)) return;
      const next = pickDefaultChoice(ctx, choices);
      if (next) setScope(next);
    }, [choices, scope?.key]);

    /* ---- 模型用量：当月全部 API 汇总，按 Token 排序 ---- */
    useEffect(() => {
      const sequence = ++modelsSequence.current;
      const from = month.year + '-' + String(month.month + 1).padStart(2, '0') + '-01';
      const next = new Date(month.year, month.month + 1, 1);
      const to = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-01';
      setModels(current => ({ ...current, loading: true, error: '' }));
      infoRequest('getModelUsage', { all: true, from, to }).then(value => {
        if (!alive.current || modelsSequence.current !== sequence) return;
        const failure = value?.status === 'error' ? '模型用量读取失败'
          : value?.status === 'unavailable' ? '模型用量接口暂不可用，稍后会自动重试；若持续出现请完全退出并重启 DSH'
          : value?.status === 'invalid' ? '模型用量参数无效' : '';
        setModels({
          loading: false, monthKey: from.slice(0, 7), error: failure,
          list: Array.isArray(value?.models) ? value.models : [],
        });
      }).catch(reason => {
        if (!alive.current || modelsSequence.current !== sequence) return;
        setModels({ loading: false, monthKey: from.slice(0, 7), list: [], error: String(reason?.message || '模型用量读取失败') });
      });
    }, [month.year, month.month, usage.updatedAt]);

    /* ---- 选定范围后按模型取自己的汇总与日曲线 ---- */
    useEffect(() => {
      if (!scope) { setModelScope({ loading: false, data: null, error: '' }); return; }
      let cancelled = false;
      const sessionId = usage.identity?.sessionId || resolveIdentity(ctx)?.sessionId || '';
      setModelScope(current => ({ ...current, loading: true, error: '' }));
      infoRequest('getModelSummary', {
        sessionId,
        selection: { provider: scope.provider, model: scope.model },
        days: 370,
      }).then(value => {
        if (cancelled) return;
        setModelScope({ loading: false, data: value?.status === 'ready' ? value : null, error: value?.status === 'error' ? '模型用量读取失败' : '' });
      }).catch(reason => {
        if (cancelled) return;
        setModelScope({ loading: false, data: null, error: String(reason?.message || '模型用量读取失败') });
      });
      return () => { cancelled = true; };
    }, [scope?.key, usage.identity?.provider, usage.identity?.model]);

    const value = editing && draft ? draft : snapshot.value;
    const identity = adapter?.getIdentity?.() || {};
    const name = value.displayName?.trim() || identity.name || '个人资料';
    const avatar = safeAvatar(value.avatar || identity.avatarUrl);
    const locked = busy || avatarBusy || !snapshot.ready;

    const change = patch => { setDraft(current => ({ ...(current || snapshot.value), ...patch })); setError(''); setNotice(''); };
    const begin = () => { setDraft({ ...snapshot.value }); setEditing(true); setError(''); setNotice(''); };
    const cancel = () => { uploadSequence.current++; setAvatarBusy(false); setDraft(null); setEditing(false); setError(''); setNotice(''); };
    useEffect(() => { if (editing) editor.current?.querySelector('input:not([type=file])')?.focus({ preventScroll: true }); }, [editing]);

    async function save() {
      if (locked || !draft) return;
      setBusy(true); setError(''); setNotice('');
      try {
        const result = await store.commit(draft);
        if (!alive.current) return;
        if (result?.status === 'local-only') { setError(result.error || '当前窗口已应用，写入 DSH 失败，请重试保存。'); return; }
        setEditing(false); setDraft(null); setNotice('已保存。');
      } catch (reason) { if (alive.current) setError(reason?.message || '保存失败，请重试。'); }
      finally { if (alive.current) setBusy(false); }
    }
    async function upload(event) {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      const sequence = ++uploadSequence.current; setAvatarBusy(true); setError('');
      try { const data = await prepareAvatar(file); if (alive.current && uploadSequence.current === sequence) change({ avatar: data }); }
      catch (reason) { if (alive.current && uploadSequence.current === sequence) setError(reason?.message || '头像处理失败。'); }
      finally { if (alive.current && uploadSequence.current === sequence) setAvatarBusy(false); }
    }

    /* ---- 用量字段解析 ---- */
    const data = usage.data || {};
    const totals = data?.usage?.totals || {};
    const balanceTotal = Number(data?.balance?.data?.total);
    const balanceCurrency = data?.balance?.data?.currency || 'CNY';
    const subscriptionBalance = Number(data?.subscription?.balance);
    const subscriptionUnit = typeof data?.subscription?.balanceUnit === 'string' ? data.subscription.balanceUnit : '';
    const subscriptionCurrency = typeof data?.subscription?.currency === 'string' && /^[A-Z]{3}$/.test(data.subscription.currency)
      ? data.subscription.currency
      : ['CNY', 'USD'].includes(subscriptionUnit) ? subscriptionUnit : '';
    const creditLabel = subscriptionUnit === 'credits' ? '积分' : '余额';
    const creditText = Number.isFinite(subscriptionBalance)
      ? subscriptionCurrency
        ? formatMoney(subscriptionBalance, subscriptionCurrency)
        : numberText(subscriptionBalance) + (subscriptionUnit && subscriptionUnit !== 'credits' ? ' ' + subscriptionUnit : '')
      : '';
    // 额度窗口：服务商返回 usedPercent 或 remainingPercent，统一折算为剩余百分比。
    const quotaLabels = { '5h': '5 小时', '5-hour': '5 小时', five_hour: '5 小时', seven_day: '7 天', hourly: '小时', daily: '每日', day: '每日', weekly: '每周', week: '每周', monthly: '每月', month: '每月' };
    const quotaWindows = (Array.isArray(data?.subscription?.windows) ? data.subscription.windows : []).flatMap((item, index) => {
      const used = Number(item?.usedPercent);
      const remaining = Number.isFinite(used) ? 100 - used : Number(item?.remainingPercent);
      if (!Number.isFinite(remaining)) return [];
      const key = typeof item?.key === 'string' ? item.key : 'window-' + index;
      const label = typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : (quotaLabels[key] || key);
      return [{ key, label, remaining: Math.max(0, Math.min(100, remaining)) }];
    });
    const billingMode = (() => {
      const raw = data?.mode ?? data?.billingMode;
      const text = typeof raw === 'string' ? raw.trim().toLowerCase() : typeof raw?.mode === 'string' ? raw.mode.trim().toLowerCase() : '';
      if (['subscription', 'billing', 'balance'].includes(text)) return text;
      if (data?.subscription?.mode === 'subscription' || quotaWindows.length || Number.isFinite(subscriptionBalance)) return 'subscription';
      const bill = data?.billing?.data;
      if (data?.billing?.mode === 'billing' || Number.isFinite(Number(bill?.currentPeriodSpend)) || Number.isFinite(Number(bill?.usage))) return 'billing';
      if (data?.balance?.estimate !== true && Number.isFinite(balanceTotal)) return 'balance';
      return 'unknown';
    })();
    const subscriptionPlan = typeof data?.subscription?.plan === 'string' && data.subscription.plan.trim()
      ? data.subscription.plan.trim()
      : typeof data?.subscription?.planType === 'string' ? data.subscription.planType.trim() : '';
    const bill = data?.billing?.data || {};
    const billSpend = Number(bill?.currentPeriodSpend);
    const billUsage = Number(bill?.usage);
    const billCurrency = typeof bill?.currency === 'string' && bill.currency ? bill.currency : balanceCurrency;
    const billPeriod = ['together', 'amazon-bedrock', 'huggingface', 'cloudflare'].includes(data?.billing?.type)
      ? '本月' : data?.billing?.type === 'fireworks' ? '本周期' : '当期';
    // 首格按服务商计费口径切换：订阅额度 / 积分或余额 / 账期账单 / 实时余额。
    const account = (() => {
      if (billingMode === 'subscription') {
        if (quotaWindows.length) {
          const primary = quotaWindows[0];
          const extras = quotaWindows.slice(1, 3).map(item => item.label + ' ' + item.remaining.toFixed(1) + '%').join(' · ');
          return {
            label: primary.label + '额度',
            value: primary.remaining.toFixed(1) + '%',
            tint: primary.remaining <= 20 ? 'g' : 'a',
            hint: ['剩余额度', extras, creditText ? creditLabel + ' ' + creditText : ''].filter(Boolean).join(' · '),
          };
        }
        if (creditText) return { label: creditLabel, value: creditText, tint: 'a', hint: subscriptionPlan ? '订阅 · ' + subscriptionPlan : '订阅账户' };
        return { label: '订阅', value: subscriptionPlan || '—', tint: 'a', hint: subscriptionPlan ? '服务商未提供额度窗口' : '额度未提供' };
      }
      if (billingMode === 'billing') {
        if (Number.isFinite(billSpend)) return { label: billPeriod + '账单', value: formatMoney(billSpend, billCurrency), tint: 'a', hint: '按账期结算' };
        if (Number.isFinite(billUsage)) return { label: billPeriod + '用量', value: numberText(billUsage) + (typeof bill?.usageUnit === 'string' && bill.usageUnit ? ' ' + bill.usageUnit : ''), tint: 'a', hint: '按账期结算' };
        return { label: '本期账单', value: '—', tint: 'a', hint: '服务商未返回账单' };
      }
      if (billingMode === 'balance' && Number.isFinite(balanceTotal) && data?.balance?.estimate !== true) {
        return { label: '账户余额', value: formatMoney(balanceTotal, balanceCurrency), tint: 'a', hint: '服务商实时余额' };
      }
      if (creditText) return { label: creditLabel, value: creditText, tint: 'a', hint: '订阅账户' };
      return { label: '账户余额', value: '—', tint: 'a', hint: '服务商未返回余额' };
    })();
    const scopedTotals = scope ? (modelScope.data?.totals || null) : totals;
    const allTime = scopedTotals?.allTime || null;
    const last30 = scopedTotals?.last30Days || null;
    const today = scopedTotals?.today || null;
    const allTimeTokens = Number(allTime?.tokens) || 0;
    const last30Tokens = Number(last30?.tokens) || 0;
    const trend = scope
      ? (Array.isArray(modelScope.data?.points) ? modelScope.data.points : [])
      : Array.isArray(data?.usage?.trend) ? data.usage.trend : [];
    const errorList = Object.entries(data?.errors || {}).filter(([, failure]) => failure);

    /* ---- Token 活动：按年月查看每日用量与月度统计 ---- */
    const nowDate = new Date();
    const currentIndex = nowDate.getFullYear() * 12 + nowDate.getMonth();
    const todayKey = localDayKey(nowDate);
    const historyPoints = scope
      ? (Array.isArray(modelScope.data?.points) ? modelScope.data.points : [])
      : history.points;
    const historySince = scope ? Number(modelScope.data?.sinceTs) : Number(history.sinceTs);
    const historyLoading = scope ? modelScope.loading : history.loading;
    const historyError = scope ? modelScope.error : history.error;
    // 复用插件「鲸梦主题」里已适配的 DSH 下拉组件；缺失时退回原生 select。
    const Picker = (() => { try { return globalThis.__WD_PROFILE__?.Select || null; } catch { return null; } })();
    const earliestIndex = useMemo(() => {
      if (Number.isFinite(historySince)) {
        const since = new Date(historySince);
        if (Number.isFinite(since.getTime())) return since.getFullYear() * 12 + since.getMonth();
      }
      const first = historyPoints.find(point => /^\d{4}-\d{2}-\d{2}$/.test(point?.date || ''));
      if (!first) return null;
      const [year, monthValue] = first.date.split('-').map(Number);
      return year * 12 + (monthValue - 1);
    }, [historyPoints, historySince]);
    const selectedIndex = month.year * 12 + month.month;
    const canPrevMonth = earliestIndex != null && selectedIndex > earliestIndex;
    const canNextMonth = selectedIndex < currentIndex;
    const monthOptions = useMemo(() => {
      const lowest = earliestIndex == null ? currentIndex : Math.min(earliestIndex, selectedIndex);
      const list = [];
      for (let index = currentIndex; index >= lowest; index--) {
        list.push({ index, year: Math.floor(index / 12), month: index % 12 });
      }
      return list;
    }, [earliestIndex, currentIndex, selectedIndex]);
    const stepMonth = delta => {
      const next = selectedIndex + delta;
      if (next < (earliestIndex ?? next) || next > currentIndex) return;
      setMonth({ year: Math.floor(next / 12), month: next % 12 });
    };

    const monthly = useMemo(() => {
      const prefix = month.year + '-' + String(month.month + 1).padStart(2, '0') + '-';
      const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
      const lead = (new Date(month.year, month.month, 1).getDay() + 6) % 7; // 周一=0 … 周日=6
      const isCurrent = selectedIndex === currentIndex;
      const elapsed = isCurrent ? Math.min(daysInMonth, nowDate.getDate()) : daysInMonth;
      const byDate = new Map(), amounts = new Map();
      let tokens = 0, activeDays = 0, max = 1, recordCount = 0, unpriced = 0;
      for (const point of historyPoints) {
        if (typeof point?.date !== 'string' || !point.date.startsWith(prefix)) continue;
        const value = Number(point.tokens) || 0;
        byDate.set(point.date, { tokens: value, amount: amountText(point) });
        tokens += value;
        if (value > 0) activeDays++;
        if (value > max) max = value;
        recordCount += Number(point.recordCount) || 0;
        unpriced += Number(point.unpricedRecords) || 0;
        for (const item of amountItems(point)) {
          const amount = Number(item.amount);
          if (Number.isFinite(amount)) amounts.set(item.currency, (amounts.get(item.currency) || 0) + amount);
        }
      }
      const previous = new Date(month.year, month.month - 1, 1);
      const previousPrefix = previous.getFullYear() + '-' + String(previous.getMonth() + 1).padStart(2, '0') + '-';
      let previousTokens = 0;
      for (const point of historyPoints) {
        if (typeof point?.date !== 'string' || !point.date.startsWith(previousPrefix)) continue;
        previousTokens += Number(point.tokens) || 0;
      }
      const cells = ['一', '二', '三', '四', '五', '六', '日'].map(label =>
        h('span', { key: 'head-' + label, className: 'wdp-heat-weekday' }, label));
      for (let index = 0; index < lead; index++) {
        cells.push(h('span', { key: 'lead-' + index, className: 'wdp-heat-cell wdp-heat-blank' }));
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const key = prefix + String(day).padStart(2, '0');
        const entry = byDate.get(key);
        const value = entry?.tokens || 0;
        const future = isCurrent && day > nowDate.getDate();
        const ratio = value / max;
        const level = !value ? 0 : ratio > 0.8 ? 4 : ratio > 0.55 ? 3 : ratio > 0.3 ? 2 : 1;
        const isToday = isCurrent && key === todayKey;
        cells.push(h('span', {
          key: 'cell-' + key,
          className: 'wdp-heat-cell wdp-heat-' + level + (future ? ' wdp-heat-future' : '') + (isToday ? ' wdp-heat-today' : ''),
          title: future ? '未来日期'
            : (isToday ? '今天 · ' : '') + (month.month + 1) + '月' + day + '日'
              + (value ? ' · ' + formatTokens(value) + ' token' : ' · 无使用')
              + (entry?.amount && entry.amount !== '—' ? ' · ' + entry.amount : ''),
        }));
      }
      const tail = (7 - ((lead + daysInMonth) % 7)) % 7;
      for (let index = 0; index < tail; index++) {
        cells.push(h('span', { key: 'tail-' + index, className: 'wdp-heat-cell wdp-heat-blank' }));
      }
      const spend = [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount }));
      const tokensDelta = previousTokens > 0 ? ((tokens - previousTokens) / previousTokens) * 100 : null;
      return {
        cells, tokens, activeDays, elapsed, daysInMonth, max, spend, tokensDelta, previousTokens,
        spendTotal: spend.length ? amountText({ amounts: spend }) : '—',
        dailyTokens: elapsed > 0 ? tokens / elapsed : 0,
        dailySpend: elapsed > 0 && spend.length ? spend[0].amount / elapsed : null,
        spendCurrency: spend[0]?.currency || 'CNY',
        hasData: tokens > 0 || recordCount > 0,
      };
    }, [historyPoints, month.year, month.month, selectedIndex, currentIndex, todayKey]);

    const monthCompare = monthly.tokens === 0
      ? '本月暂无用量'
      : monthly.tokensDelta != null
        ? '较上月 ' + (monthly.tokensDelta >= 0 ? '+' : '−') + Math.abs(monthly.tokensDelta).toFixed(0) + '%'
        : monthly.previousTokens === 0 ? '上月无记录' : '';

    const todayTokens = Number(today?.tokens) || Number((() => {
      const key = localDayKey(new Date());
      return trend.find(point => point?.date === key)?.tokens;
    })()) || 0;

    const cards = [
      { key: 'account', label: account.label, value: account.value, tint: account.tint, hint: account.hint },
      { key: 'allTime', label: '累计花费', value: amountText(allTime), tint: 'b', hint: '从开始记录以来' },
      { key: 'today', label: '今日花费', value: amountText(today), tint: 'd', hint: '当天 0 点起' },
      { key: 'last30', label: '近 30 天', value: amountText(last30), tint: 'c', hint: '滚动 30 天' },
      { key: 'tokens', label: '累计 Token', value: allTimeTokens || last30Tokens ? formatTokens(allTimeTokens || last30Tokens) : '—', tint: 'f', hint: last30Tokens ? '近30天 ' + formatTokens(last30Tokens) : '全部会话' },
      { key: 'todayTokens', label: '今日 Token', value: todayTokens ? formatTokens(todayTokens) : '—', tint: 'e', hint: '当天消耗' },
    ];
    const monthModels = models.list;
    const activeModelId = modelScope.data?.model || scope?.model || '';

    const button = (text, props = {}) => h('button', { type: 'button', className: 'wdp-button', ...props }, text);

    return h('section', { className: 'wdp-settings', 'aria-labelledby': 'wdp-title', 'data-wdp-page': '', 'aria-busy': busy || !snapshot.ready },

      /* 标题 */
      h('header', { className: 'wdp-heading' },
        h('div', null,
          h('h2', { id: 'wdp-title' }, '用量统计'),
          h('p', null, '整体账户统计，覆盖全部会话累计。头像与外观在「鲸梦主题」的当前使用卡片中调整。')),
        h('span', { className: 'wdp-live', title: '页面可见时每 30 秒自动刷新' },
          h('i', { className: 'wdp-live-dot', 'aria-hidden': true }),
          usage.loading && !usage.data ? '读取中…' : usage.updatedAt ? '已同步 ' + clockText(usage.updatedAt) : '等待同步',
        ),
      ),

      /* 用量概览 */
      h('section', { className: 'wdp-usage' },
        h('div', { className: 'wdp-section-heading' },
          h('div', { className: 'wdp-usage-head' },
            h('h3', null, '用量概览'),
          ),
          usage.error
            ? h('span', { className: 'wdp-usage-error' }, usage.error)
            : h('span', { className: 'wdp-usage-time' }, usage.loading ? '读取中…' : usage.identity ? '已连接账户' : '未识别会话模型'),
        ),
        h('div', { className: 'wdp-scope' },
          tabs.length
            ? h('div', { className: 'wdp-scope-tabs', role: 'group', 'aria-label': '统计范围', ref: tabStrip },
                tabs.map(tab => h('button', {
                  key: tab.key, type: 'button',
                  className: 'wdp-scope-tab' + (scope?.key === tab.key ? ' is-active' : ''),
                  'aria-pressed': scope?.key === tab.key,
                  title: tab.title,
                  ref: node => { if (node) tabNodes.current[tab.key] = node; else delete tabNodes.current[tab.key]; },
                  onClick: () => setScope(choices.find(item => item.key === tab.key) || choices[0]),
                }, tab.label)))
            : h('span', { className: 'wdp-scope-current' }, '正在读取模型列表…'),
        ),
        h('div', { className: 'wdp-metric-grid' },
          cards.map(card => h('div', { key: card.key, className: 'wdp-metric wdp-tint-' + card.tint },
            h('span', { className: 'wdp-metric-label' }, card.label),
            h('strong', { className: 'wdp-metric-value' }, (usage.loading && !usage.data) || (scope && modelScope.loading) ? '…' : card.value),
            h('small', { className: 'wdp-metric-hint' }, card.hint),
          )),
        ),
        scope && modelScope.error && h('p', { className: 'wdp-usage-note' },
          '模型用量读取失败：' + modelScope.error + '。若是刚更新插件，请完全退出并重启 DSH，让宿主加载新的模型统计接口。'),
        errorList.length > 0 && h('p', { className: 'wdp-usage-note' }, '部分数据源暂不可用：' + errorList.map(([key]) => key).join('、')),
      ),

      /* Token 活动 */
      h('section', { className: 'wdp-activity' },
        h('div', { className: 'wdp-section-heading' },
          h('div', null,
            h('h3', null, 'Token 活动'),
            h('p', null, month.year + ' 年 ' + (month.month + 1) + ' 月每日用量 · 颜色代表当日用量档位'),
          ),
          h('div', { className: 'wdp-activity-tools' },
            h('div', { className: 'wdp-month-nav', role: 'group', 'aria-label': '切换年月' },
              h('button', { type: 'button', 'aria-label': '上一个月', disabled: !canPrevMonth, onClick: () => stepMonth(-1) }, '‹'),
              h('div', { className: 'wdp-month-picker' },
                Picker
                  ? h(Picker, {
                      label: '年月', hideLabel: true, className: 'wdp-month-picker-field',
                      value: String(selectedIndex),
                      options: monthOptions.map(option => ({
                        value: String(option.index),
                        label: option.year + ' 年 ' + (option.month + 1) + ' 月',
                      })),
                      onChange: next => {
                        const index = Number(next);
                        if (Number.isFinite(index)) setMonth({ year: Math.floor(index / 12), month: index % 12 });
                      },
                    })
                  : h('select', {
                      className: 'wdp-month-select', 'aria-label': '选择年月', value: String(selectedIndex),
                      onChange: event => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) setMonth({ year: Math.floor(next / 12), month: next % 12 });
                      },
                    }, monthOptions.map(option => h('option', { key: option.index, value: String(option.index) },
                      option.year + ' 年 ' + (option.month + 1) + ' 月'))),
              ),
              h('button', { type: 'button', 'aria-label': '下一个月', disabled: !canNextMonth, onClick: () => stepMonth(1) }, '›'),
            ),
            h('span', { className: 'wdp-legend' },
              h('span', null, '少'),
              [0, 1, 2, 3, 4].map(level => h('i', { key: level, className: 'wdp-heat-cell wdp-heat-' + level })),
              h('span', null, '多'),
            ),
          ),
        ),
        h('div', { className: 'wdp-month-stats' },
          h('div', { className: 'wdp-month-stat' },
            h('span', null, '本月 Token'),
            h('strong', null, monthly.hasData ? formatTokens(monthly.tokens) : '—'),
            h('small', null, monthCompare || '按自然月统计'),
          ),
          h('div', { className: 'wdp-month-stat' },
            h('span', null, '本月消费'),
            h('strong', null, monthly.spendTotal),
            h('small', null, monthly.dailySpend != null
              ? '日均 ' + formatMoney(monthly.dailySpend, monthly.spendCurrency)
              : '按账本计价汇总'),
          ),
          h('div', { className: 'wdp-month-stat' },
            h('span', null, '日均 Token'),
            h('strong', null, monthly.hasData ? formatTokens(monthly.dailyTokens) : '—'),
            h('small', null, '按 ' + monthly.elapsed + ' 天计算'),
          ),
          h('div', { className: 'wdp-month-stat' },
            h('span', null, '活跃天数'),
            h('strong', null, monthly.activeDays + ' 天'),
            h('small', null, '本月共 ' + monthly.daysInMonth + ' 天'),
          ),
        ),
        monthly.hasData
          ? h('div', { className: 'wdp-heat-grid' }, monthly.cells)
          : h('p', { className: 'wdp-heat-empty', role: 'status' },
              historyLoading && !historyPoints.length ? '正在读取每日用量…'
                : historyError ? '历史用量读取失败：' + historyError
                  : selectedIndex === currentIndex ? '暂无每日用量记录，产生对话后会显示在这里。' : '该月没有用量记录。'),
        Number.isFinite(historySince) && h('p', { className: 'wdp-activity-note' },
          '本地账本自 ' + (() => {
            const start = new Date(historySince);
            return start.getFullYear() + ' 年 ' + (start.getMonth() + 1) + ' 月 ' + start.getDate() + ' 日';
          })() + ' 起记录，更早月份暂无可统计数据。'),
      ),

      /* 模型用量 */
      h('section', { className: 'wdp-models' },
        h('div', { className: 'wdp-section-heading' },
          h('div', null,
            h('h3', null, '模型用量'),
            h('p', null, month.year + ' 年 ' + (month.month + 1) + ' 月 · 全部 API 汇总 · 按 Token 排序'),
          ),
          h('span', { className: 'wdp-usage-time' },
            models.loading ? '读取中…' : models.error ? '读取失败' : monthModels.length ? monthModels.length + ' 个模型' : '暂无记录'),
        ),
        monthModels.length
          ? h('div', { className: 'wdp-model-list' }, (() => {
              const total = monthModels.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0);
              return monthModels.map(item => {
                const share = total > 0 ? Math.max(0, Math.min(100, (Number(item.tokens) || 0) / total * 100)) : 0;
                const key = (item.provider || '') + '/' + (item.model || '');
                return h('div', { key, className: 'wdp-model-row' + (scope && item.provider === scope.provider && item.model === activeModelId ? ' wdp-model-selected' : '') },
                  h('div', { className: 'wdp-model-head' },
                    h('strong', null, item.model || '未知模型'),
                    item.provider && h('span', null, item.provider),
                    h('em', null, share.toFixed(1) + '%'),
                  ),
                  h('div', { className: 'wdp-model-bar', 'aria-hidden': true }, h('i', { style: { width: share + '%' } })),
                  h('div', { className: 'wdp-model-meta' },
                    h('span', null, formatTokens(item.tokens) + ' token'),
                    h('span', null, amountText({ amounts: item.amounts, tokens: item.tokens, recordCount: item.records, unpricedRecords: item.unpricedRecords })),
                    Number(item.records) > 0 && h('span', null, numberText(item.records) + ' 次请求'),
                  ),
                );
              });
            })())
          : h('p', { className: 'wdp-heat-empty', role: 'status' },
              models.loading ? '正在读取模型用量…' : models.error ? models.error : '该月没有模型用量记录。'),
        models.error && monthModels.length > 0 && h('p', { className: 'wdp-usage-note' }, '模型用量：' + models.error),
      ),
    );
  }
  return ProfileSettings;
}

export const profileStyles = `
.wdp-settings{--wdp-ink:var(--dsw-alias-label-primary,#e9edf6);--wdp-muted:var(--dsw-alias-label-secondary,#99a7bd);--wdp-line:var(--dsw-alias-border-l1,rgba(134,151,179,.22));--wdp-surface:var(--dsw-alias-bg-layer-1,#111824);--wdp-accent:var(--dsw-alias-state-business-primary,#83a2ff);display:grid;gap:20px;width:100%;max-width:none;min-width:0;color:var(--wdp-ink);font:14px/1.55 system-ui,sans-serif;container-type:inline-size}.wdp-settings *{box-sizing:border-box}.wdp-settings button,.wdp-settings input,.wdp-settings select{font:inherit}
.wdp-heading,.wdp-section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px}.wdp-heading h2{margin:0;font-size:28px;line-height:1.3;letter-spacing:-.03em}.wdp-heading p,.wdp-section-heading p{margin:7px 0 0;color:var(--wdp-muted);font-size:12px}.wdp-section-heading h3{margin:0;font-size:16px;font-weight:650}.wdp-live{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:12px;color:var(--wdp-muted);white-space:nowrap}.wdp-live-dot{width:6px;height:6px;border-radius:50%;background:#78bd9f;box-shadow:0 0 0 3px rgba(120,189,159,.16);animation:wdp-pulse 2.4s ease-in-out infinite}@keyframes wdp-pulse{0%,100%{opacity:.4}50%{opacity:1}}
.wdp-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:7px 14px;border:1px solid var(--wdp-line);border-radius:9px;background:color-mix(in srgb,var(--wdp-surface) 92%,var(--wdp-ink) 8%);color:var(--wdp-ink);cursor:pointer;white-space:nowrap;line-height:1.4;transition:background .16s,border-color .16s}.wdp-button:hover:not(:disabled){border-color:var(--wdp-accent);background:color-mix(in srgb,var(--wdp-accent) 10%,var(--wdp-surface))}.wdp-primary{background:var(--wdp-accent);border-color:var(--wdp-accent);color:var(--dsw-alias-brand-text,#10203a);font-weight:650}.wdp-primary:hover:not(:disabled){background:color-mix(in srgb,var(--wdp-accent) 87%,white)}.wdp-settings :is(button,input,select):disabled{opacity:.48;cursor:default}.wdp-settings :is(button,input,select):focus-visible{outline:2px solid var(--wdp-accent);outline-offset:3px}
.wdp-hero{position:relative;isolation:isolate;overflow:hidden;width:100%;height:clamp(230px,20vw,320px);min-height:230px;border:1px solid var(--wdp-line);border-radius:20px;background:#0a1c30}.wdp-scene-media,.wdp-hero-shade{position:absolute;inset:0;pointer-events:none}.wdp-hero-shade{background:linear-gradient(90deg,rgba(3,9,22,.70),rgba(3,9,22,.30) 45%,rgba(3,9,22,.03) 76%);z-index:1}.wdp-identity{position:relative;z-index:2;display:flex;align-items:center;gap:26px;height:100%;padding:28px 38px;padding-right:24%;color:#f5f8ff;text-shadow:0 2px 14px #0009}.wdp-avatar{position:relative;width:160px;height:160px;flex:none}.wdp-portrait{position:absolute;inset:0;background:#315879;mask-size:100% 100%;-webkit-mask-size:100% 100%;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;display:grid;place-items:center;font-size:42px;font-weight:650;overflow:hidden}.wdp-portrait img{width:100%;height:100%;object-fit:cover}.wdp-frame-media{position:absolute;inset:0;pointer-events:none;z-index:1}
.wdp-identity-copy{min-width:0;max-width:100%;flex:1 1 auto}.wdp-identity h3{font-size:clamp(26px,3vw,42px);line-height:1.25;letter-spacing:-.02em;margin:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.wdp-identity p{margin:10px 0 0;color:#e3edf8;font-size:14px;display:flex;align-items:center;gap:9px}.wdp-theme-chip{display:inline-flex;padding:2px 9px;border-radius:20px;background:#ffffff1f;border:1px solid #ffffff2e;font-size:11px;letter-spacing:.04em;text-shadow:none}
.wdp-avatar-pencil{position:absolute;right:2px;bottom:2px;z-index:4;display:grid;place-items:center;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid #ffffff38;background:#0b1525cc;color:#eaf1ff;cursor:pointer;opacity:0;transform:scale(.86);transition:opacity .16s,transform .16s,background .16s;backdrop-filter:blur(6px)}.wdp-avatar-pencil svg{width:16px;height:16px;pointer-events:none}.wdp-avatar:hover .wdp-avatar-pencil,.wdp-avatar:focus-within .wdp-avatar-pencil{opacity:1;transform:scale(1)}.wdp-avatar-pencil:hover{background:var(--wdp-accent);border-color:var(--wdp-accent);color:#10203a}
.wdp-avatar-editing{position:relative;cursor:pointer;border-radius:4px}.wdp-avatar-editing input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}.wdp-avatar-mask{position:absolute;inset:0;z-index:3;display:grid;place-items:center;border-radius:6px;background:#04101ecc;color:#eaf1ff;font-size:12px;letter-spacing:.04em;opacity:0;transition:opacity .16s;text-shadow:none}.wdp-avatar-editing:hover .wdp-avatar-mask,.wdp-avatar-editing:focus-within .wdp-avatar-mask{opacity:1}
.wdp-hero-edit{display:grid;gap:12px;max-width:420px}.wdp-name-input{width:100%;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid #ffffff3d;background:#08152ae0;color:#f5f8ff;font-size:clamp(18px,2.2vw,26px);font-weight:600;letter-spacing:-.01em;text-shadow:none}.wdp-hero-actions{display:flex;flex-wrap:wrap;gap:9px}.wdp-hero-actions .wdp-button{background:#0b1525c9;border-color:#ffffff30;color:#eff5ff;text-shadow:none}
.wdp-feedback{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px;margin:0;border:1px solid var(--wdp-line);border-radius:10px;font-size:13px}.wdp-error{color:var(--dsw-alias-state-warn-primary,#ddab74);background:color-mix(in srgb,currentColor 5%,transparent);border-color:color-mix(in srgb,currentColor 35%,transparent)}.wdp-success{color:var(--dsw-alias-state-success-primary,#78bd9f)}
.wdp-usage,.wdp-activity,.wdp-models{display:grid;gap:14px;border:1px solid var(--wdp-line);border-radius:16px;padding:20px 22px;background:color-mix(in srgb,var(--wdp-ink) 3%,transparent)}.wdp-usage-time,.wdp-usage-error{font-size:12px;color:var(--wdp-muted)}.wdp-usage-error{color:#ddab74}
.wdp-usage-head{flex:1 1 260px;min-width:0}.wdp-scope{min-width:0;max-width:100%}.wdp-scope-current{font-size:11px;color:var(--wdp-muted)}.wdp-scope-tabs{display:flex;align-items:center;gap:5px;padding:3px;border-radius:9px;background:color-mix(in srgb,var(--wdp-muted) 8%,transparent);min-width:0;max-width:100%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-padding-inline:3px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch}.wdp-scope-tabs::-webkit-scrollbar{display:none}.wdp-scope-tab{flex:1 1 0;min-width:calc(8em + 18px);padding:11px 8px;min-height:43px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--wdp-muted);font-family:inherit;font-size:13px;font-weight:600;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;outline:none;transition:color .15s,border-color .15s,background-color .15s}.wdp-scope-tab:hover{color:var(--wdp-ink)}.wdp-scope-tab:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--wdp-accent) 28%,transparent)}.wdp-scope-tab.is-active{color:var(--wdp-ink);background:color-mix(in srgb,var(--wdp-ink) 9%,var(--wdp-surface));border-color:var(--wdp-line);box-shadow:0 1px 2px #0000000a}
.wdp-model-list{display:grid;gap:13px}.wdp-model-row{display:grid;gap:6px;min-width:0}.wdp-model-head{display:flex;align-items:baseline;gap:8px;min-width:0}.wdp-model-head strong{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wdp-model-head span{font-size:10px;color:var(--wdp-muted);flex:none}.wdp-model-head em{margin-left:auto;font-style:normal;font-size:11px;color:var(--wdp-muted);font-variant-numeric:tabular-nums}.wdp-model-bar{height:6px;border-radius:999px;background:color-mix(in srgb,var(--wdp-muted) 14%,transparent);overflow:hidden}.wdp-model-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--wdp-accent),color-mix(in srgb,var(--wdp-accent) 55%,#3aa8a0))}.wdp-model-meta{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--wdp-muted);font-variant-numeric:tabular-nums}.wdp-model-selected .wdp-model-head strong{color:var(--wdp-accent)}
.wdp-metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.wdp-metric{position:relative;display:grid;gap:5px;padding:14px 16px 13px;border-radius:12px;border:1px solid var(--wdp-line);background:color-mix(in srgb,var(--wdp-surface) 88%,transparent);overflow:hidden}.wdp-metric::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--wdp-bar,#83a2ff)}.wdp-tint-a{--wdp-bar:#7f95ff}.wdp-tint-b{--wdp-bar:#e5c16b}.wdp-tint-c{--wdp-bar:#88b4e0}.wdp-tint-d{--wdp-bar:#8fcfb0}.wdp-tint-e{--wdp-bar:#c9a4e0}.wdp-tint-f{--wdp-bar:#e0a58c}.wdp-tint-g{--wdp-bar:#d9a441}.wdp-metric-label{font-size:12px;color:var(--wdp-muted)}.wdp-metric-value{font-size:20px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;line-height:1.35}.wdp-metric-hint{font-size:11px;color:var(--wdp-muted);opacity:.85}
.wdp-usage-note{margin:0;font-size:12px;color:#ddab74}
.wdp-legend{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--wdp-muted);padding:4px 10px;border:1px solid var(--wdp-line);border-radius:20px;background:color-mix(in srgb,var(--wdp-ink) 3%,transparent)}.wdp-activity-tools{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}.wdp-month-nav{display:inline-flex;align-items:center;gap:5px;min-width:0}.wdp-month-nav>button{display:grid;place-items:center;width:26px;height:26px;padding:0;border:1px solid var(--wdp-line);border-radius:50%;background:color-mix(in srgb,var(--wdp-ink) 4%,transparent);color:var(--wdp-muted);cursor:pointer;font-size:15px;line-height:1;transition:background .14s,border-color .14s,color .14s}.wdp-month-nav>button:hover:not(:disabled){border-color:var(--wdp-accent);background:color-mix(in srgb,var(--wdp-accent) 14%,transparent);color:var(--wdp-ink)}.wdp-month-nav>button:disabled{opacity:.3;cursor:default}.wdp-month-picker{display:inline-flex;min-width:0}.wdp-month-picker .wd-select-field{gap:0;min-width:0;color:var(--wdp-ink)}.wdp-month-picker .wd-select-row{flex-wrap:nowrap;gap:0}.wdp-month-picker .wd-select-control{min-width:118px;min-height:28px;height:28px;padding:2px 10px;border-radius:999px;border-color:var(--wdp-line);background-color:color-mix(in srgb,var(--wdp-surface) 88%,transparent);font-size:12px;gap:10px}.wdp-month-picker .wd-select-control:hover:not(:disabled){border-color:var(--wdp-accent);background-image:none;background-color:color-mix(in srgb,var(--wdp-accent) 12%,var(--wdp-surface))}.wdp-month-picker .wd-select-chevron{width:5px;height:5px;margin:-2px 1px 0}.wdp-month-picker .wd-select-native-wrap{min-width:0;max-width:100%}.wdp-month-picker .wd-select-native{min-width:118px;min-height:28px;height:28px;padding:2px 28px 2px 10px;border-radius:999px;border-color:var(--wdp-line);background-color:color-mix(in srgb,var(--wdp-surface) 88%,transparent);font-size:12px}.wdp-month-select{appearance:none;-webkit-appearance:none;min-width:118px;height:28px;padding:2px 26px 2px 10px;border:1px solid var(--wdp-line);border-radius:999px;background-color:color-mix(in srgb,var(--wdp-surface) 88%,transparent);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2398a5bd' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;color:var(--wdp-ink);font-size:12px;font-variant-numeric:tabular-nums;text-align:left;cursor:pointer;outline:none;transition:border-color .14s}.wdp-month-select:hover{border-color:var(--wdp-accent)}.wdp-month-select option{background:var(--wdp-surface);color:var(--wdp-ink)}.wdp-month-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.wdp-month-stat{display:grid;gap:3px;padding:10px 13px;border:1px solid var(--wdp-line);border-radius:11px;background:color-mix(in srgb,var(--wdp-surface) 76%,transparent);min-width:0}.wdp-month-stat>span{font-size:11px;color:var(--wdp-muted)}.wdp-month-stat>strong{font-size:17px;font-weight:650;line-height:1.3;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.wdp-month-stat>small{font-size:10px;color:var(--wdp-muted);opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wdp-heat-future{background:transparent;box-shadow:inset 0 0 0 1px rgba(148,163,184,.10)}.wdp-activity-note{margin:0;font-size:11px;line-height:1.6;color:var(--wdp-muted);opacity:.85}.wdp-heat-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.wdp-heat-weekday{font-size:10px;color:var(--wdp-muted);text-align:center;letter-spacing:.06em;padding-bottom:2px}.wdp-heat-cell{display:block;width:100%;aspect-ratio:2.2;border-radius:6px;background:rgba(148,163,184,.14);transition:transform .12s,box-shadow .12s}.wdp-legend .wdp-heat-cell{width:11px;height:11px;aspect-ratio:1;border-radius:3px;flex:none}.wdp-heat-grid .wdp-heat-cell:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.22)}.wdp-heat-0{background:rgba(148,163,184,.14)}.wdp-heat-1{background:#5b8def}.wdp-heat-2{background:#3aa8a0}.wdp-heat-3{background:#d9a441}.wdp-heat-4{background:#d95f8a}.wdp-heat-today{box-shadow:0 0 0 1.5px var(--wdp-accent),0 0 0 4px color-mix(in srgb,var(--wdp-accent) 20%,transparent)}.wdp-heat-blank{background:transparent;box-shadow:inset 0 0 0 1px rgba(148,163,184,.12)}.wdp-heat-empty{margin:0;padding:26px;text-align:center;color:var(--wdp-muted);font-size:13px;border:1px dashed var(--wdp-line);border-radius:12px}
@container(max-width:760px){.wdp-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wdp-month-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container(max-width:650px){.wdp-heading{align-items:flex-start;flex-direction:column;gap:12px}.wdp-heading h2{font-size:24px}.wdp-hero{height:235px;min-height:235px}.wdp-identity{padding:22px;gap:18px;padding-right:20px}.wdp-avatar{width:124px;height:124px}.wdp-identity h3{font-size:28px}.wdp-usage,.wdp-activity,.wdp-models{padding:16px;border-radius:14px}.wdp-activity .wdp-section-heading{flex-wrap:wrap;align-items:flex-start}.wdp-activity-tools{width:100%;justify-content:space-between}}
@container(max-width:430px){.wdp-metric-grid{grid-template-columns:1fr}.wdp-heat-grid{gap:4px}.wdp-identity{padding:16px;gap:12px}.wdp-avatar{width:98px;height:98px}.wdp-identity h3{font-size:22px}}
@media(prefers-reduced-motion:reduce){.wdp-settings *{transition:none!important}}
/* 「鲸梦主题 → 当前使用」卡片的头像与编辑 */
.wd-look-card{position:relative;isolation:isolate;overflow:hidden;align-items:center;min-height:108px;padding:16px;border-radius:14px;color:#f2f7ff}
.wd-look-scene{position:absolute;inset:0;z-index:0;pointer-events:none}
.wd-look-scene *{pointer-events:none!important}
.wd-look-shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(4,10,22,.78),rgba(4,10,22,.42) 52%,rgba(4,10,22,.12))}
.wd-look-copy{position:relative;z-index:2;display:grid;gap:3px}
.wd-look-copy>span{color:#c8d6ea}
.wd-look-copy>strong{color:#f5f8ff}
.wd-look-copy>small{color:#c8d6ea}
.wd-look-avatar{position:relative;z-index:2;width:64px;height:64px;flex:none}
.wd-look-portrait{position:absolute;inset:0;background:#315879;mask-size:100% 100%;-webkit-mask-size:100% 100%;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;display:grid;place-items:center;overflow:hidden;font-size:22px;font-weight:650}
.wd-look-portrait img{width:100%;height:100%;object-fit:cover}
.wd-look-frame{position:absolute;inset:0;pointer-events:none;z-index:1}
.wd-look-pencil{position:absolute;right:-3px;bottom:-3px;z-index:3;width:24px;height:24px;padding:0;border-radius:50%;border:1px solid var(--wd-line);background:var(--wd-surface);color:var(--wd-ink);display:grid;place-items:center;cursor:pointer;opacity:0;transform:scale(.86);transition:opacity .16s,transform .16s}
.wd-look-pencil svg{width:12px;height:12px;pointer-events:none}
.wd-look-avatar:hover .wd-look-pencil,.wd-look-avatar:focus-within .wd-look-pencil{opacity:1;transform:scale(1)}
.wd-look-pencil:hover{border-color:var(--wd-accent);color:var(--wd-accent)}
.wd-look-upload{position:absolute;inset:0;z-index:3;display:grid;place-items:center;border-radius:4px;background:#04101ecc;color:#eaf1ff;font-size:10px;letter-spacing:.04em;cursor:pointer;overflow:hidden}
.wd-look-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.wd-look-copy{display:grid;gap:3px}
.wd-look-name{width:100%;min-height:30px;padding:4px 8px;border:1px solid var(--wd-line);border-radius:7px;background:var(--wd-surface);color:var(--wd-ink);font-size:14px;font-weight:600}
.wd-look-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.wd-look-actions button{min-height:26px;padding:3px 9px;border:1px solid var(--wd-line);border-radius:7px;background:transparent;color:var(--wd-ink);font-size:11px;cursor:pointer}
.wd-look-actions .wd-primary-button{background:var(--wd-accent);border-color:var(--wd-accent);color:var(--dsw-alias-brand-text,#10203a);font-weight:600}
.wd-look-error{color:var(--dsw-alias-state-warn-primary,#ddab74)}
.wd-look-reset{margin-left:auto;align-self:center;z-index:2;min-height:30px;padding:5px 12px;border:1px solid rgba(255,255,255,.26);border-radius:8px;background:rgba(8,18,34,.55);color:#eaf1ff;font-size:12px;cursor:pointer;white-space:nowrap;backdrop-filter:blur(4px);transition:border-color .16s,background .16s}
.wd-look-reset:hover:not(:disabled){border-color:rgba(255,255,255,.6);background:rgba(8,18,34,.78)}
.wd-look-reset:disabled{opacity:.5;cursor:default}
`;
