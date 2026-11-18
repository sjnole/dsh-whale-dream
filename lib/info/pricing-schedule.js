/**
 * Pure pricing-clock helpers shared by the account host, ledger worker and
 * offline preview. No credentials, network, storage or browser globals.
 *
 * DeepSeek rule and CNY rates checked 2026-11-15:
 * https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * 2026 leave calendar retained from the pinned core and rechecked in full:
 * https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
 * 2027 State Council notice, read in full from its ministry publication:
 * https://chinajob.mohrss.gov.cn/h5/c/2026-11-09/635850.shtml
 * Weekend make-up workdays remain off-peak under DeepSeek's explicit rule.
 */
export const PRICING_TIMEZONE = 'Asia/Shanghai';
export const DEEPSEEK_PRICING_SOURCE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
export const DEEPSEEK_PRICING_CHECKED_AT = '2026-11-15';
const OFFSET = 8 * 3600000;
const DAY = 86400000;
const WEEKEND_OFFPEAK_EFFECTIVE_AT = Date.UTC(2026, 7, 22, 16);
const PEAK_WINDOWS = [[540, 720], [840, 1080]];
const HOLIDAYS = {
  2026: [['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'],
    ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']],
  2027: [['01-01', '01-03'], ['02-05', '02-13'], ['04-03', '04-05'],
    ['05-01', '05-05'], ['06-09', '06-09'], ['09-15', '09-15'], ['10-01', '10-07']],
};
const OFFICIAL_PROVIDERS = new Set(['deepseek', 'deepseek-official', 'deepseek-account']);
const VERIFIED_MODELS = new Set(['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro']);
const pad = value => String(value).padStart(2, '0');

function dayInfo(nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  const date = new Date(nowMs + OFFSET);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear(), monthDay = pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  const covered = Object.hasOwn(HOLIDAYS, year);
  return {
    year, minute: date.getUTCHours() * 60 + date.getUTCMinutes(),
    dayKey: String(year).padStart(4, '0') + '-' + monthDay,
    dayStart: Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - OFFSET,
    weekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
    holiday: covered && HOLIDAYS[year].some(([first, last]) => monthDay >= first && monthDay <= last),
    covered,
  };
}

/** Unknown future holiday years never become an asserted weekday peak price. */
export function currentPeriod(nowMs) {
  const info = dayInfo(nowMs);
  if (!info) return 'unknown';
  const revisedCalendar = nowMs >= WEEKEND_OFFPEAK_EFFECTIVE_AT;
  if (revisedCalendar && (info.weekend || info.holiday)) return 'offpeak';
  const peak = PEAK_WINDOWS.some(([start, end]) => info.minute >= start && info.minute < end);
  if (!peak) return 'offpeak';
  if (revisedCalendar && !info.covered) return 'unknown';
  return 'peak';
}

export function describePeakSchedule(nowMs) {
  const info = dayInfo(nowMs);
  if (!info) return null;
  const boundaries = [0, 540, 720, 840, 1080, 1440];
  const daySegments = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const startMinute = boundaries[index], endMinute = boundaries[index + 1];
    const period = currentPeriod(info.dayStart + startMinute * 60000);
    const previous = daySegments[daySegments.length - 1];
    if (previous?.period === period) previous.endMinute = endMinute;
    else daySegments.push({ startMinute, endMinute, period });
  }
  return {
    type: 'deepseek-peak-valley', timezone: PRICING_TIMEZONE,
    dayKey: info.dayKey,
    dayKind: info.holiday ? 'holiday' : info.weekend ? 'weekend' : info.covered ? 'weekday' : 'calendar-unverified',
    daySegments, weekdayPeakWindows: PEAK_WINDOWS.map(window => [...window]),
    weekendsOffpeak: true, holidaysOffpeak: true,
    calendarYears: Object.keys(HOLIDAYS).map(Number).sort((a, b) => a - b),
    coverage: info.covered ? 'complete' : 'partial',
  };
}

/** Search a bounded horizon using the same clock as actual cost calculation. */
export function nextPriceSwitch(nowMs) {
  const info = dayInfo(nowMs);
  if (!info) return null;
  const period = currentPeriod(nowMs);
  // A known later window is not proof of a price change from an unknown state.
  if (period === 'unknown') return null;
  for (let day = 0; day <= 31; day++) {
    for (const minute of [540, 720, 840, 1080]) {
      const at = info.dayStart + day * DAY + minute * 60000;
      if (at <= nowMs) continue;
      const nextPeriod = currentPeriod(at);
      if (nextPeriod === 'unknown' || nextPeriod === period) continue;
      return {
        at, atLabel: pad(Math.floor(minute / 60)) + ':' + pad(minute % 60),
        nextIsPeak: nextPeriod === 'peak', period: nextPeriod,
        dayKey: dayInfo(at).dayKey, timezone: PRICING_TIMEZONE,
      };
    }
  }
  return null;
}

function readRatePlan(value) {
  if (!value || !['inputCacheHit', 'inputCacheMiss', 'output'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)) return null;
  return { inputCacheHit: value.inputCacheHit, inputCacheMiss: value.inputCacheMiss, output: value.output };
}

/** Extra display metadata does not introduce a second price table. */
export function pricingPresentation({ provider, model, entry, nowMs }) {
  const peak = entry?.mode === 'peak-valley' ? readRatePlan(entry.peak) : null;
  const offpeak = entry?.mode === 'peak-valley' ? readRatePlan(entry.offpeak) : null;
  const ratePlans = peak && offpeak ? { peak, offpeak } : null;
  const official = OFFICIAL_PROVIDERS.has(provider) && VERIFIED_MODELS.has(model) && ratePlans !== null;
  return {
    ratePlans,
    schedule: official ? describePeakSchedule(nowMs) : null,
    sourceUrl: official ? DEEPSEEK_PRICING_SOURCE_URL : null,
    checkedAt: official ? DEEPSEEK_PRICING_CHECKED_AT : null,
  };
}
