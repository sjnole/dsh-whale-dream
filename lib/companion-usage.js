const emptyLabel = '暂无用量';
const currencies = { CNY: '¥', USD: '$' };
const currencyCodes = new Set(Intl.supportedValuesOf('currency'));
const amountFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const compactFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const wholeFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

function usageKey(sessionId, provider) {
  return `${sessionId}\0${provider}`;
}

export function normalizeCompanionCurrency(value) {
  const code = typeof value === 'string' && /^[a-z]{3}$/i.test(value.trim()) ? value.trim().toUpperCase() : '';
  return currencyCodes.has(code) ? code : '';
}

function formatAmount(currency, amount, estimated) {
  const sign = currencies[currency] ?? `${currency} `;
  if (amount > 0 && amount < 0.0001) return `${estimated ? '约 ' : ''}<${sign}0.0001`;
  return `${estimated ? '约 ' : ''}${sign}${amountFormat.format(amount)}`;
}

export function formatCompanionUsage(entry) {
  if (!entry || !Number.isFinite(entry.calls) || entry.calls <= 0) return emptyLabel;
  const costs = Array.isArray(entry.costs) ? entry.costs : [];
  const amounts = costs.flatMap(item => {
    const currency = normalizeCompanionCurrency(item?.currency);
    return currency && Number.isFinite(item.amount) && item.amount >= 0 ? [{ ...item, currency }] : [];
  });
  if (amounts.length && amounts.length === costs.length && entry.unpricedCalls === 0 &&
    (entry.mode !== 'subscription' || amounts.every(item => !item.estimated))) {
    return amounts.sort((left, right) => left.currency.localeCompare(right.currency))
      .map(item => formatAmount(item.currency, item.amount, item.estimated)).join(' · ');
  }
  if (Number.isFinite(entry.tokens) && entry.tokens > 0) {
    const scale = entry.tokens >= 1e6 ? [1e6, 'M'] : entry.tokens >= 1e3 ? [1e3, 'K'] : [1, ''];
    return `${compactFormat.format(entry.tokens / scale[0])}${scale[1]} Token`;
  }
  return `${wholeFormat.format(entry.calls)} 次请求`;
}

const quotaWindows = {
  '1h': '1 小时', '1-hour': '1 小时', one_hour: '1 小时', hourly: '每小时', hour: '每小时',
  '5h': '5 小时', '5-hour': '5 小时', five_hour: '5 小时', rolling: '5 小时',
  '1d': '1 天', '1-day': '1 天', one_day: '1 天', '24h': '24 小时', '24-hour': '24 小时',
  daily: '每日', day: '每日', '7d': '7 天', '7-day': '7 天', seven_day: '7 天', weekly: '每周', week: '每周',
  monthly: '每月', month: '每月',
};

function quotaUnits(value, unit) {
  if (!Number.isFinite(value) || value < 0 || typeof unit !== 'string' || !unit.trim()) return '';
  const units = { credits: '积分', credit: '积分', points: '积分', tokens: 'Token', token: 'Token',
    requests: '次请求', request: '次请求' };
  const name = unit.trim().slice(0, 12);
  const known = name.toLowerCase();
  return `${compactFormat.format(value)} ${Object.hasOwn(units, known) ? units[known] : name}`;
}

function quotaWindow(window) {
  if (!window || typeof window !== 'object') return '';
  const key = typeof window.key === 'string' ? window.key.toLowerCase().trim() : '';
  const name = Object.hasOwn(quotaWindows, key) ? quotaWindows[key]
    : typeof window.label === 'string' ? window.label.trim().slice(0, 12) : '';
  const count = Number.isFinite(window.remaining) ? window.remaining
    : Number.isFinite(window.limit) && window.limit > 0 && Number.isFinite(window.used) && window.used >= 0
      ? window.limit - window.used : null;
  const remaining = Number.isFinite(window.remainingPercent) ? window.remainingPercent
    : Number.isFinite(window.usedPercent) ? 100 - window.usedPercent : null;
  const display = quotaUnits(count, window.unit) ||
    (remaining !== null && remaining >= 0 && remaining <= 100 ? `${compactFormat.format(remaining)}%` : '');
  return display ? `${name ? name + ' ' : ''}余 ${display}` : '';
}

function quotaMoney(currency, value) {
  const code = normalizeCompanionCurrency(currency);
  return code && Number.isFinite(value) && value >= 0 ? formatAmount(code, value, false) : '';
}

export function formatCompanionQuota(mode, snapshot, now = Date.now()) {
  if (!snapshot || snapshot.estimate || !Number.isFinite(snapshot.fetchedAt)) return '';
  let label = '';
  if (mode === 'subscription') {
    const windows = (Array.isArray(snapshot.windows) ? snapshot.windows : []).slice(0, 32).map(quotaWindow).filter(Boolean).slice(0, 8);
    const unit = snapshot.balanceUnit;
    const balance = quotaMoney(snapshot.currency ?? unit, snapshot.balance) || quotaUnits(snapshot.balance, unit);
    label = [...windows, balance].filter(Boolean).join(' · ');
  } else if (mode === 'billing') {
    const data = snapshot.data;
    const spend = quotaMoney(data?.currency, data?.currentPeriodSpend);
    const usage = quotaUnits(data?.usage, data?.usageUnit);
    if (spend || usage) label = `当期已用 ${[spend, usage].filter(Boolean).join(' · ')}`;
  } else if (mode === 'balance') {
    const balance = quotaMoney(snapshot.data?.currency ?? snapshot.currency, snapshot.data?.total) ||
      quotaUnits(snapshot.data?.total, snapshot.data?.balanceUnit ?? snapshot.balanceUnit);
    if (balance) label = `余额 ${balance}`;
  }
  return label && (snapshot.error || now - snapshot.fetchedAt > 90000) ? `上次 · ${label}` : label;
}

export function createCompanionUsageSource() {
  const listeners = new Set();
  let read;
  let readQuota;
  let readBalance;
  function notify(sessionId, provider) {
    for (const listener of listeners) listener(sessionId, provider);
  }
  return {
    attach(reader, quotaReader, balanceReader) {
      read = reader;
      readQuota = quotaReader;
      readBalance = balanceReader;
      notify();
      return () => {
        if (read !== reader) return;
        read = undefined;
        readQuota = undefined;
        readBalance = undefined;
      };
    },
    read(pairs) { return read ? read(pairs) : Promise.resolve([]); },
    quota(sessionId, provider, model) { return readQuota?.({ sessionId, provider, model }) ?? Promise.resolve(''); },
    balance(sessionId, provider, model) { return readBalance?.({ sessionId, provider, model }) ?? Promise.resolve(''); },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify,
  };
}

export function createCompanionUsageDisplay(source, onChange) {
  const entries = new Map();
  let timer;
  let reading = false;
  let disposed = false;

  function schedule() {
    if (disposed || timer || reading || ![...entries.values()].some(entry => entry.dirty)) return;
    timer = setTimeout(() => {
      timer = undefined;
      void update();
    }, 85);
    timer.unref?.();
  }

  async function update() {
    const batch = [];
    for (const [key, entry] of entries) {
      if (!entry.dirty) continue;
      entry.dirty = false;
      batch.push({ key, entry, revision: entry.revision });
    }
    if (!batch.length) return;
    reading = true;
    try {
      const rows = await source.read(batch.map(item => item.entry.pair));
      if (disposed) return;
      const totals = new Map((rows ?? []).map(row => [usageKey(row.sessionId, row.provider), row]));
      let changed = false;
      for (const { key, entry, revision } of batch) {
        if (entries.get(key) !== entry || entry.revision !== revision) continue;
        const label = formatCompanionUsage(totals.get(key));
        if (entry.label === label) continue;
        entry.label = label;
        changed = true;
      }
      if (changed) onChange();
    } catch { /* A later session or ledger event can refresh data if the ledger was unavailable. */ }
    finally {
      reading = false;
      schedule();
    }
  }

  const unsubscribe = source.subscribe((sessionId, provider) => {
    const matching = sessionId && provider ? [entries.get(usageKey(sessionId, provider))] : entries.values();
    for (const entry of matching) {
      if (!entry) continue;
      entry.dirty = true;
      entry.revision += 1;
    }
    schedule();
  });

  return {
    label(sessionId, provider) { return entries.get(usageKey(sessionId, provider))?.label ?? emptyLabel; },
    demand(pairs) {
      const desired = new Map(pairs.map(pair => [usageKey(pair.sessionId, pair.provider), pair]));
      for (const key of entries.keys()) if (!desired.has(key)) entries.delete(key);
      for (const [key, pair] of desired) {
        if (!entries.has(key)) entries.set(key, { pair, label: emptyLabel, revision: 0, dirty: true });
      }
      if (!entries.size && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      entries.clear();
      unsubscribe();
    },
  };
}
