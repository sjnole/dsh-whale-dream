/**
 * Indexed summary extension for the MIT ledger core. Runs only in its worker.
 * Complete days are read from existing day buckets; an exact rolling cutoff
 * scans at most its boundary day. No RPC materializes the complete record log.
 */
export function createLedgerSummary({ sql, get }) {
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;
  const dayKey = (ts) => new Date(ts + OFFSET).toISOString().slice(0, 10);
  const dayStart = (day) => Date.parse(day + 'T00:00:00Z') - OFFSET;
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  function fold(rows, sinceTs = null) {
    const amounts = new Map();
    let recordCount = 0, unpricedRecords = 0, tokens = 0;
    for (const row of rows) {
      const priced = number(row.records);
      const unknown = number(row.unpriced);
      recordCount += priced + unknown;
      unpricedRecords += unknown;
      tokens += number(row.tokens);
      if (priced > 0 && (row.currency === 'USD' || row.currency === 'CNY')) {
        amounts.set(row.currency, (amounts.get(row.currency) || 0) + number(row.cost));
      }
    }
    return {
      amounts: [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount })),
      tokens, unpricedRecords, recordCount, pricedRecords: recordCount - unpricedRecords,
      pricingCoverage: recordCount > 0 ? (recordCount - unpricedRecords) / recordCount : null,
      sinceTs: Number.isFinite(sinceTs) ? sinceTs : null,
    };
  }
  const bucketFields = 'currency,SUM(input+cacheRead+cacheWrite+output) tokens,SUM(cost) cost,SUM(records) records,SUM(unpriced) unpriced';
  function firstRecord(account, from = 0, to = 8640000000000000) {
    return get('SELECT MIN(ts) ts FROM records WHERE account=? AND ts>=? AND ts<?', account, from, to)?.ts ?? null;
  }
  return function billingSummary(account, nowMs, days = 30) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    // 日桶查询按天索引，允许按月/跨月回看；上限 400 天防止一次取回过多。
    const wanted = Number.isFinite(number(days)) ? Math.min(400, Math.max(1, Math.trunc(days))) : 30;
    const owner = typeof account === 'string' ? account : '';
    const today = dayKey(now);
    const tomorrow = dayKey(dayStart(today) + DAY);
    const cutoff = now - 30 * DAY;
    const cutoffDay = dayKey(cutoff);
    const cutoffNext = dayKey(dayStart(cutoffDay) + DAY);
    const trendFrom = dayKey(dayStart(today) - (wanted - 1) * DAY);
    const sinceTs = firstRecord(owner);
    const allRows = sql('SELECT ' + bucketFields + ' FROM days WHERE account=? GROUP BY currency').all(owner);
    const todayRows = sql('SELECT ' + bucketFields + ' FROM days WHERE account=? AND day=? GROUP BY currency').all(owner, today);
    const rollingRows = sql('SELECT ' + bucketFields + ' FROM days WHERE account=? AND day>=? AND day<? GROUP BY currency').all(owner, cutoffNext, tomorrow);
    // Only the partial boundary day uses records. JSON payload stays inside the worker.
    const boundaryRows = sql(`SELECT currency,SUM(COALESCE(json_extract(payload,'$.input'),0)+COALESCE(json_extract(payload,'$.cacheRead'),0)+COALESCE(json_extract(payload,'$.cacheWrite'),0)+COALESCE(json_extract(payload,'$.output'),0)) tokens,
      SUM(cost) cost,COUNT(cost) records,SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) unpriced
      FROM records WHERE account=? AND folded=0 AND ts>=? AND ts<? GROUP BY currency`).all(owner, cutoff, dayStart(cutoffNext));
    const rows = sql('SELECT day,' + bucketFields + ' FROM days WHERE account=? AND day>=? AND day<? GROUP BY day,currency ORDER BY day,currency').all(owner, trendFrom, tomorrow);
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.day)) grouped.set(row.day, []);
      grouped.get(row.day).push(row);
    }
    return {
      timezone: 'Asia/Shanghai', sinceTs, days: wanted,
      totals: {
        today: fold(todayRows, firstRecord(owner, dayStart(today))),
        last30Days: fold([...rollingRows, ...boundaryRows], firstRecord(owner, cutoff)),
        allTime: fold(allRows, sinceTs),
      },
      points: [...grouped].map(([date, entries]) => ({ date, ...fold(entries) })),
    };
  };
}

/**
 * 按单个 provider + model 汇总用量与花费。records 保留 payload，直接扫描即可，
 * 不依赖 days 表（days 没有模型维度）。
 */
export function createModelSummary({ sql }) {
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;
  const dayKey = (ts) => new Date(ts + OFFSET).toISOString().slice(0, 10);
  const dayStart = (day) => Date.parse(day + 'T00:00:00Z') - OFFSET;
  const tokensExpr = `(CASE WHEN json_type(payload,'$.totalTokens') IN ('integer','real') AND json_extract(payload,'$.totalTokens')>=0
      THEN json_extract(payload,'$.totalTokens')
      ELSE COALESCE(json_extract(payload,'$.input'),0)+COALESCE(json_extract(payload,'$.cacheRead'),0)+COALESCE(json_extract(payload,'$.cacheWrite'),0)+COALESCE(json_extract(payload,'$.output'),0) END)`;
  function fold(rows, sinceTs = null) {
    const amounts = new Map();
    let tokens = 0, recordCount = 0, unpricedRecords = 0;
    for (const row of rows) {
      tokens += number(row.tokens);
      const priced = number(row.priced), unpriced = number(row.unpriced);
      recordCount += priced + unpriced;
      unpricedRecords += unpriced;
      if (priced > 0 && (row.currency === 'USD' || row.currency === 'CNY')) {
        amounts.set(row.currency, (amounts.get(row.currency) || 0) + number(row.cost));
      }
    }
    return {
      amounts: [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount })),
      tokens, recordCount, unpricedRecords, sinceTs: Number.isFinite(sinceTs) ? sinceTs : null,
    };
  }
  return function modelSummary(account, provider, model, nowMs, days = 370) {
    const owner = typeof account === 'string' ? account : '';
    if (typeof provider !== 'string' || !provider || typeof model !== 'string' || !model) return null;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const wanted = Math.min(400, Math.max(1, Math.trunc(Number(days)) || 370));
    // DSH 目录里的模型 id 与账本记录可能使用不同别名（如 deepseek-v4.1-flash / deepseek-flash）。
    // 精确匹配失败时按 flash / pro 等家族名回退，避免把有数据的模型显示成 0。
    const family = (value) => {
      const text = String(value || '').toLowerCase();
      if (text.includes('flash')) return 'flash';
      if (text.includes('pro')) return 'pro';
      if (text.includes('coder')) return 'coder';
      if (text.includes('reasoner')) return 'reasoner';
      return text.replace(/[^a-z0-9]/g, '');
    };
    let resolved = model;
    try {
      const candidates = sql(`SELECT json_extract(payload,'$.model') model, COUNT(*) n FROM records
        WHERE account=? AND json_extract(payload,'$.provider')=? GROUP BY model ORDER BY n DESC`).all(owner, provider)
        .filter(row => typeof row.model === 'string' && row.model);
      if (!candidates.some(row => row.model === resolved)) {
        const target = family(resolved);
        const match = candidates.find(row => target && family(row.model) === target);
        if (match) resolved = match.model;
      }
    } catch { /* keep the requested model */ }
    const where = `account=? AND json_extract(payload,'$.provider')=? AND json_extract(payload,'$.model')=?`;
    const today = dayKey(now);
    const tomorrow = dayKey(dayStart(today) + DAY);
    const cutoff = now - 30 * DAY;
    const trendFrom = dayStart(dayKey(dayStart(today) - (wanted - 1) * DAY));
    const sinceTs = sql(`SELECT MIN(ts) ts FROM records WHERE ${where}`).all(owner, provider, resolved)[0]?.ts ?? null;
    const allRows = sql(`SELECT currency,SUM(${tokensExpr}) tokens,SUM(cost) cost,COUNT(cost) priced,
      SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) unpriced
      FROM records WHERE ${where} GROUP BY currency`).all(owner, provider, resolved);
    const todayRows = sql(`SELECT currency,SUM(${tokensExpr}) tokens,SUM(cost) cost,COUNT(cost) priced,
      SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) unpriced
      FROM records WHERE ${where} AND ts>=? AND ts<? GROUP BY currency`).all(owner, provider, resolved, dayStart(today), dayStart(tomorrow));
    const rollingRows = sql(`SELECT currency,SUM(${tokensExpr}) tokens,SUM(cost) cost,COUNT(cost) priced,
      SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) unpriced
      FROM records WHERE ${where} AND ts>=? AND ts<? GROUP BY currency`).all(owner, provider, resolved, cutoff, now);
    const points = sql(`SELECT date((ts+28800000)/1000,'unixepoch') day, currency,
      SUM(${tokensExpr}) tokens,SUM(cost) cost,COUNT(cost) priced,
      SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) unpriced
      FROM records WHERE ${where} AND ts>=? AND ts<?
      GROUP BY day,currency ORDER BY day,currency`).all(owner, provider, resolved, trendFrom, dayStart(tomorrow));
    const grouped = new Map();
    for (const row of points) {
      if (!grouped.has(row.day)) grouped.set(row.day, []);
      grouped.get(row.day).push(row);
    }
    return {
      timezone: 'Asia/Shanghai', days: wanted, sinceTs, model: resolved,
      totals: { today: fold(todayRows), last30Days: fold(rollingRows), allTime: fold(allRows, sinceTs) },
      points: [...grouped].map(([date, entries]) => ({ date, ...fold(entries) })),
    };
  };
}
/**
 * 最近 N 天用量最多的模型（跨账户），用于给用量页挑一个默认统计范围。
 */
export function createTopModel({ sql }) {
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const DAY = 86400000;
  const tokensExpr = `(CASE WHEN json_type(payload,'$.totalTokens') IN ('integer','real') AND json_extract(payload,'$.totalTokens')>=0
      THEN json_extract(payload,'$.totalTokens')
      ELSE COALESCE(json_extract(payload,'$.input'),0)+COALESCE(json_extract(payload,'$.cacheRead'),0)+COALESCE(json_extract(payload,'$.cacheWrite'),0)+COALESCE(json_extract(payload,'$.output'),0) END)`;
  return function topModel(nowMs, days = 30) {
    const wanted = Math.min(370, Math.max(1, Math.trunc(Number(days)) || 30));
    const from = (Number.isFinite(nowMs) ? nowMs : Date.now()) - wanted * DAY;
    const rows = sql(`SELECT COALESCE(json_extract(payload,'$.provider'),'') provider,
      COALESCE(json_extract(payload,'$.model'),'') model,
      SUM(${tokensExpr}) tokens, COUNT(*) records
      FROM records WHERE ts>=? GROUP BY provider, model
      ORDER BY tokens DESC, records DESC LIMIT 1`).all(from);
    const row = rows[0];
    if (!row || (!row.provider && !row.model)) return null;
    return { provider: row.provider || '', model: row.model || '', tokens: number(row.tokens), records: number(row.records), days: wanted };
  };
}

const MODEL_TOKENS = `(CASE WHEN json_type(payload,'$.totalTokens') IN ('integer','real') AND json_extract(payload,'$.totalTokens') >= 0
  THEN json_extract(payload,'$.totalTokens')
  ELSE COALESCE(json_extract(payload,'$.input'),0)+COALESCE(json_extract(payload,'$.cacheRead'),0)+COALESCE(json_extract(payload,'$.cacheWrite'),0)+COALESCE(json_extract(payload,'$.output'),0) END)`;

/* records 的 provider/model/currency 聚合结果整理成界面直接可用的模型列表。 */
function foldModelRows(rows) {
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const grouped = new Map();
  for (const row of rows) {
    const key = (row.model || '') + '\u0000' + (row.provider || '');
    const entry = grouped.get(key) || { model: row.model || '', provider: row.provider || '', tokens: 0, amounts: [], records: 0, unpricedRecords: 0 };
    entry.tokens += number(row.tokens);
    entry.records += number(row.priced) + number(row.unpriced);
    entry.unpricedRecords += number(row.unpriced);
    const amount = number(row.cost);
    if ((row.currency === 'USD' || row.currency === 'CNY') && number(row.priced) > 0) {
      const found = entry.amounts.find(item => item.currency === row.currency);
      if (found) found.amount += amount;
      else entry.amounts.push({ currency: row.currency, amount });
    }
    grouped.set(key, entry);
  }
  return [...grouped.values()]
    .map(entry => ({ ...entry, amounts: entry.amounts.sort((a, b) => a.currency.localeCompare(b.currency)) }))
    .sort((a, b) => b.tokens - a.tokens);
}

export function createModelBreakdown({ sql }) {
  return function modelBreakdown(account, fromTs, toTs) {
    const owner = typeof account === 'string' ? account : '';
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return [];
    const rows = sql(`SELECT COALESCE(json_extract(payload,'$.model'),'') model,
      COALESCE(json_extract(payload,'$.provider'),'') provider, currency,
      COALESCE(SUM(${MODEL_TOKENS}),0) tokens,
      COALESCE(SUM(cost),0) cost,
      COUNT(CASE WHEN cost IS NOT NULL THEN 1 END) priced,
      COUNT(CASE WHEN cost IS NULL THEN 1 END) unpriced
      FROM records WHERE account=? AND ts>=? AND ts<?
      GROUP BY model,provider,currency ORDER BY tokens DESC, model`).all(owner, fromTs, toTs);
    return foldModelRows(rows);
  };
}

/* 全部 API 汇总：不按账户过滤，用于「模型用量」跨 API 对比。 */
export function createModelBreakdownAll({ sql }) {
  return function modelBreakdownAll(fromTs, toTs) {
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return [];
    const rows = sql(`SELECT COALESCE(json_extract(payload,'$.model'),'') model,
      COALESCE(json_extract(payload,'$.provider'),'') provider, currency,
      COALESCE(SUM(${MODEL_TOKENS}),0) tokens,
      COALESCE(SUM(cost),0) cost,
      COUNT(CASE WHEN cost IS NOT NULL THEN 1 END) priced,
      COUNT(CASE WHEN cost IS NULL THEN 1 END) unpriced
      FROM records WHERE ts>=? AND ts<?
      GROUP BY model,provider,currency ORDER BY tokens DESC, model`).all(fromTs, toTs);
    return foldModelRows(rows);
  };
}
