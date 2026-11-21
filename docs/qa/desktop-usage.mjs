import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompanionUsageDisplay, createCompanionUsageSource, formatCompanionQuota, formatCompanionUsage } from '../../lib/companion-usage.js';
import { __usageInternals } from '../../lib/info/index.js';
import { openLedgerStore } from '../../lib/info/ledger-store.js';

const amount = (currency, value, estimated = false) => ({ currency, amount: value, estimated });

test('live window allowance retains the actual provider meter, freshness and units', async () => {
  const now = 100000;
  const plan = { fetchedAt: now, windows: [{ key: 'five_hour', usedPercent: 22 }, { key: 'weekly', remainingPercent: 63 }], balance: 12, balanceUnit: 'credits' };
  assert.equal(formatCompanionQuota('subscription', plan, now), '5 小时 余 78% · 每周 余 63% · 12 积分');
  const wallet = { fetchedAt: now, data: { currency: 'CNY', total: 25.5 } };
  assert.equal(formatCompanionQuota('balance', wallet, now), '余额 ¥25.50');
  assert.equal(formatCompanionQuota('balance', { ...wallet, estimate: true }, now), '');
  assert.equal(formatCompanionQuota('balance', wallet, now + 91000), '上次 · 余额 ¥25.50');
  const bill = { fetchedAt: now, data: { currency: 'USD', currentPeriodSpend: 0.21 } };
  assert.equal(formatCompanionQuota('billing', bill, now), '当期已用 $0.21');
  assert.equal(formatCompanionQuota('balance', bill, now), '');
  const source = createCompanionUsageSource();
  const providerData = { deepseek: ['balance', wallet], chatgpt: ['subscription', plan], cloud: ['billing', bill] };
  const detach = source.attach(async () => [], async ({ sessionId, provider, model }) => {
    assert.equal(sessionId, 'same-tab');
    assert.equal(model, `${provider}-model`);
    return providerData[provider] ? formatCompanionQuota(...providerData[provider], now) : '';
  });
  for (const [provider, expected] of Object.entries({ deepseek: '余额 ¥25.50', chatgpt: '5 小时 余 78% · 每周 余 63% · 12 积分', cloud: '当期已用 $0.21', openai: '' })) {
    assert.equal(await source.quota('same-tab', provider, `${provider}-model`), expected);
  }
  detach();
  assert.equal(await source.quota('same-tab', 'deepseek', 'deepseek-model'), '');
});

test('idle balance has its own provider reader and never substitutes a quota or bill', async () => {
  const source = createCompanionUsageSource();
  const calls = [];
  const detach = source.attach(async () => [], async () => '5 小时 余 72%', async request => {
    calls.push(request);
    return request.provider === 'deepseek-account' ? '余额 ¥42.35' : '';
  });
  assert.equal(await source.balance('one', 'deepseek-account', 'deepseek-flash'), '余额 ¥42.35');
  assert.equal(await source.balance('two', 'chatgpt', 'gpt'), '');
  assert.deepEqual(calls, [
    { sessionId: 'one', provider: 'deepseek-account', model: 'deepseek-flash' },
    { sessionId: 'two', provider: 'chatgpt', model: 'gpt' },
  ]);
  detach();
  assert.equal(await source.balance('one', 'deepseek-account', 'deepseek-flash'), '');
});

test('hourly, daily and weekly quotas all survive normalization with exact durations and zero remaining', () => {
  const { parseAppAuthCodexUsage } = __usageInternals;
  const now = 100000;
  const result = parseAppAuthCodexUsage({ status: 'ok', windows: [
    { id: 'primary', windowSeconds: 3600, usedPercent: 10, resetAt: '2026-10-20T00:00:00.000Z' },
    { id: 'secondary', windowSeconds: 86400, usedPercent: 100 },
    { id: 'weekly', windowSeconds: 7 * 86400, usedPercent: 60 },
    { id: 'custom', windowSeconds: 90 * 60, usedPercent: 5 },
    { id: 'primary', windowSeconds: -1, usedPercent: 30 },
  ] });
  assert.deepEqual(result.windows.map(({ key, usedPercent }) => [key, usedPercent]), [
    ['one_hour', 10], ['one_day', 100], ['seven_day', 60], ['duration-5400', 5],
  ]);
  assert.equal(result.windows[0].resetsAt, Date.parse('2026-10-20T00:00:00.000Z'));
  const data = { ...result, fetchedAt: now, balance: 0, balanceUnit: 'credits' };
  assert.equal(formatCompanionQuota('subscription', data, now), '1 小时 余 90% · 1 天 余 0% · 7 天 余 40% · 90 分钟 余 95% · 0 积分');
  assert.equal(formatCompanionQuota('subscription', data, now + 91000), '上次 · 1 小时 余 90% · 1 天 余 0% · 7 天 余 40% · 90 分钟 余 95% · 0 积分');
  assert.equal(formatCompanionQuota('subscription', { fetchedAt: now, windows: [
    { key: 'hourly', remainingPercent: 0, usedPercent: 20 },
    { key: 'daily', limit: 100, used: 73, unit: 'credits' },
    { key: 'weekly', remaining: 900, unit: 'tokens' },
  ] }, now), '每小时 余 0% · 每日 余 27 积分 · 每周 余 900 Token');
  assert.equal(formatCompanionQuota('billing', { fetchedAt: now, data: {
    currency: 'EUR', currentPeriodSpend: 3.35, usage: 10, usageUnit: 'neurons',
  } }, now), '当期已用 EUR 3.35 · 10 neurons');
  assert.deepEqual(parseAppAuthCodexUsage({ status: 'ok', windows: [
    { id: 'primary', usedPercent: 5 }, { id: 'secondary', usedPercent: 10 }, { id: 'custom', usedPercent: 15 },
  ] }).windows.map(({ key }) => key), ['five_hour', 'seven_day']);
});

test('desktop usage labels use recorded currencies and distinguish missing, estimated and zero amounts', () => {
  const entry = { calls: 2, tokens: 128000, unpricedCalls: 0, mode: 'balance' };
  assert.equal(formatCompanionUsage(null), '暂无用量');
  assert.equal(formatCompanionUsage({ ...entry, costs: [amount('CNY', 0.125)] }), '¥0.125');
  assert.equal(formatCompanionUsage({ ...entry, costs: [amount('USD', 0.25)] }), '$0.25');
  assert.equal(formatCompanionUsage({ ...entry, costs: [amount('USD', 0)] }), '$0.00');
  assert.equal(formatCompanionUsage({ ...entry, costs: [amount('eur', 1.25), amount('USD', 0.25)] }), 'EUR 1.25 · $0.25');
  assert.equal(formatCompanionUsage({ ...entry, costs: [amount('QQQ', 1), amount('USD', 0.25)] }), '128K Token');
  assert.equal(formatCompanionUsage({ ...entry, costs: [amount('CNY', 0.02, true)] }), '约 ¥0.02');
  assert.equal(formatCompanionUsage({ ...entry, unpricedCalls: 1, costs: [amount('USD', 0.25)] }), '128K Token');
  assert.equal(formatCompanionUsage({ ...entry, mode: 'subscription', costs: [amount('USD', 0.25, true)] }), '128K Token');
  assert.equal(formatCompanionUsage({ ...entry, tokens: 0 }), '2 次请求');
});

test('SQLite companion ledger preserves explicit currencies and exact token totals per session and provider', () => {
  const directory = mkdtempSync(join(tmpdir(), 'whale-companion-meter-fixture-'));
  const store = openLedgerStore(directory, {
    account: row => row.provider,
    currency: row => row.currency,
    cost: row => row.cost ?? null,
    safeKey: value => String(value),
  });
  try {
    const base = { ts: 100000, sessionId: 'same-tab', provider: 'service-eur', model: 'same-model',
      input: 30, cacheRead: 10, cacheWrite: 0, output: 2, pricingVersion: 'provider-reported-fixture' };
    store.append({ ...base, id: 'cost-eur', currency: 'eur', cost: 1.25 });
    store.append({ ...base, id: 'cost-usd', provider: 'service-usd', currency: 'USD', cost: 0.28 });
    store.append({ ...base, id: 'total-only', provider: 'service-free', totalTokens: 12800 });
    store.append({ ...base, id: 'unsupported', provider: 'service-no-currency', currency: 'UNKNOWN', cost: 99 });
    store.append({ ...base, id: 'different-tab', sessionId: 'elsewhere', currency: 'EUR', cost: 99 });
    const pairs = ['service-eur', 'service-usd', 'service-free', 'service-no-currency', 'unknown'].map(provider => ({ sessionId: 'same-tab', provider }));
    assert.deepEqual(store.companionUsage(pairs).map(row => [row.provider, row.tokens, formatCompanionUsage(row)]), [
      ['service-eur', 42, 'EUR 1.25'], ['service-usd', 42, '$0.28'], ['service-free', 12800, '12.8K Token'],
      ['service-no-currency', 42, '42 Token'],
    ]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('desktop usage caches exact session and provider pairs and refreshes only the affected row', async () => {
  const source = createCompanionUsageSource();
  const requests = [];
  let deepseekAmount = 0.5;
  source.attach(async pairs => {
    requests.push(pairs);
    return pairs.map(pair => ({
      ...pair,
      calls: 1,
      unpricedCalls: 0,
      costs: [pair.provider === 'deepseek' ? amount('CNY', deepseekAmount) : amount('USD', 0.25)],
    }));
  });
  const display = createCompanionUsageDisplay(source, () => {});
  const choices = [{ sessionId: 'one', provider: 'deepseek' }, { sessionId: 'one', provider: 'openrouter' }];
  async function waitForLabel(provider, label) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (display.label('one', provider) === label) return;
      await delay(25);
    }
    assert.equal(display.label('one', provider), label);
  }
  try {
    display.demand(choices);
    await waitForLabel('openrouter', '$0.25');
    assert.equal(display.label('one', 'deepseek'), '¥0.50');
    deepseekAmount = 0.75;
    source.notify('one', 'deepseek');
    await waitForLabel('deepseek', '¥0.75');
    assert.deepEqual(requests, [choices, [choices[0]]]);
    assert.equal(display.label('one', 'openrouter'), '$0.25');
    display.demand([]);
    source.notify('one', 'openrouter');
    assert.equal(display.label('one', 'openrouter'), '暂无用量');
  } finally {
    display.dispose();
  }
});
