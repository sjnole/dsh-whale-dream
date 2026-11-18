export const SNAPSHOT_SCHEMA = 1;
export const PRICING_SOURCE_VERSION = 'dsh-bottom-info-bar@1.26.0:684beceac851';

/** One slow provider must not hold all other account/ledger fields indefinitely. */
export function withReadDeadline(promise, ms = 17000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Account read timed out')), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const amountEntries = (costs) => Object.entries(costs || {})
  .filter(([currency, amount]) => ['CNY', 'USD'].includes(currency) && finite(amount) && amount >= 0)
  .sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount }));

// Never echo a provider error body, request URL, local path or credential value.
export function safeAccountError(error) {
  if (!error) return null;
  const rawKind = typeof error === 'object' ? error.kind : 'unavailable';
  const kind = typeof rawKind === 'string' && /^[a-z0-9-]{1,48}$/.test(rawKind) ? rawKind : 'unavailable';
  const code = typeof error?.code === 'string' && /^[a-z0-9][a-z0-9.-]{0,127}$/.test(error.code) ? error.code : kind;
  const messages = {
    'no-key': '请先在 DSH 配置此账户所需的凭据。',
    credentials: '暂时无法读取 DSH 账户凭据。',
    'not-signed-in': '此账户尚未登录，请在 DSH 完成登录。',
    'not-configured': '此账户尚未配置。',
    unauthorized: '账户授权已失效，请在 DSH 重新登录或更新凭据。',
    auth: '账户授权已失效，请在 DSH 重新登录或更新凭据。',
    timeout: '账户查询超时，请稍后刷新。',
    'no-subscription': '当前账户未返回可用的订阅额度。',
    http: '服务商暂时未返回有效账户数据，请稍后刷新。',
    parse: '服务商返回的数据格式暂不受支持。',
    unsupported: '此账户暂未提供可查询的数据。',
    'rate-limit': '账户查询过于频繁，请稍后刷新。',
  };
  const message = code === 'balance.account-signed-out' || code === 'subscription.app-auth-not-signed-in'
    ? '请在 DSH 中登录此账户。'
    : messages[kind] || '暂时无法更新账户数据，已保留上次成功的结果。';
  return { kind, code, message };
}

function accountState(value, now) {
  if (!value || typeof value !== 'object') return value;
  const error = safeAccountError(value.error);
  const fetchedAt = finite(value.fetchedAt) ? value.fetchedAt : null;
  return { ...value, error, fetchedAt,
    stale: fetchedAt != null && (error != null || now - fetchedAt > 90000),
    refreshStatus: error ? (fetchedAt ? 'stale' : 'error') : fetchedAt ? 'ready' : 'unavailable' };
}

export function sessionTotal(raw, status) {
  if (!raw) return {
    amounts: [], tokens: status === 'ready' ? 0 : null,
    unpricedRecords: status === 'ready' ? 0 : null,
    recordCount: status === 'ready' ? 0 : null, pricedRecords: status === 'ready' ? 0 : null,
    pricingCoverage: null, sinceTs: null,
  };
  return {
    amounts: amountEntries(raw.costs), tokens: finite(raw.tokens) ? raw.tokens : null,
    unpricedRecords: finite(raw.unpricedRecords) ? raw.unpricedRecords : null,
    recordCount: finite(raw.recordCount) ? raw.recordCount : null,
    pricedRecords: null, pricingCoverage: null,
    sinceTs: finite(raw.sinceTs) ? raw.sinceTs : null,
  };
}

export function normalizeUsage(raw, summary, currency, state = 'ready') {
  const persistence = raw?.persistence || null;
  const status = persistence && persistence.state !== 'ok' ? 'error' : summary ? state : state === 'error' ? 'error' : 'loading';
  const empty = () => ({ amounts: [], tokens: null, unpricedRecords: null, recordCount: null, pricedRecords: null, pricingCoverage: null, sinceTs: null });
  return {
    ...(raw || {}), estimated: true, currency: currency || null, status,
    totals: {
      session: sessionTotal(raw?.currentSession, status),
      today: summary?.totals?.today || empty(),
      last30Days: summary?.totals?.last30Days || empty(),
      allTime: summary?.totals?.allTime || empty(),
    },
    timezone: 'Asia/Shanghai', sinceTs: summary?.sinceTs ?? null,
    trendDays: summary?.days || 30, trend: summary?.points || [],
    persistence: persistence && persistence.state !== 'ok'
      ? { state: persistence.state, code: persistence.code || null, at: persistence.at || null, message: '本地用量账本暂不可用；账户信息仍可独立查询。' }
      : persistence,
  };
}

/** All dependencies are account/data readers; this module never sees a secret. */
export function createSnapshotApi(api) {
  return {
    async getSnapshot(args = {}) {
      const selection = api.selectionFromArgs(args);
      const keys = ['balance', 'subscription', 'billing', 'pricing', 'usage'];
      const results = await Promise.allSettled([
        api.getBalance(args), api.getSubscription(args), api.getBilling(args), api.getPricing(args), api.getUsage(args),
      ].map((job) => withReadDeadline(job)));
      const errors = {};
      const blocks = {};
      const fetchedAt = Date.now();
      results.forEach((result, index) => {
        const key = keys[index];
        if (result.status === 'fulfilled') blocks[key] = result.value;
        else { blocks[key] = null; errors[key] = '此项数据暂时无法读取，请稍后刷新。'; }
      });
      blocks.balance = accountState(blocks.balance, fetchedAt);
      blocks.subscription = accountState(blocks.subscription, fetchedAt);
      blocks.billing = accountState(blocks.billing, fetchedAt);
      // A provider without a public balance endpoint must never acquire a fabricated top-up.
      if (blocks.balance?.estimate) blocks.balance = { ...blocks.balance, data: null, estimate: false, accountDataUnavailable: true };
      if (blocks.balance) blocks.balance.alert = null;
      if (blocks.pricing) blocks.pricing = {
        ...blocks.pricing, estimated: true,
        currency: blocks.pricing.prices || blocks.pricing.ratePlans ? api.modelCurrency(selection.provider, selection.model) : null,
        sourceVersion: PRICING_SOURCE_VERSION,
      };
      for (const key of ['balance', 'subscription', 'billing']) {
        if (blocks[key]?.error) errors[key] = blocks[key].error.message;
      }
      const mode = api.selectionIsResolved(selection) ? api.detectBillingMode(selection.provider).mode : 'unknown';
      return { schema: SNAPSHOT_SCHEMA, selection: { provider: selection.provider, model: selection.model }, fetchedAt, mode, ...blocks, errors };
    },
    async getTrend(args = {}) {
      const days = args.days === 7 ? 7 : 30;
      const selection = api.selectionFromArgs(args);
      if (!api.selectionIsResolved(selection)) return { days, timezone: 'Asia/Shanghai', sinceTs: null, points: [], status: 'unavailable' };
      try {
        const result = await api.getDailySummary(selection, days);
        return result ? { ...result, status: 'ready' } : { days, timezone: 'Asia/Shanghai', sinceTs: null, points: [], status: 'loading' };
      } catch {
        return { days, timezone: 'Asia/Shanghai', sinceTs: null, points: [], status: 'error', error: '本地用量账本暂不可用。' };
      }
    },
  };
}
