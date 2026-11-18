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
    const wanted = days === 7 ? 7 : 30;
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
