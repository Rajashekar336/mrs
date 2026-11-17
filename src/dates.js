// All business dates are handled in Indian Standard Time.
const TZ = 'Asia/Kolkata';

const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw Object.assign(new Error(`Invalid date: ${s}`), { status: 400 });
  return new Date(`${s}T00:00:00+05:30`);
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const dayStr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

function ranges() {
  const t = todayStr();
  const today = parseDay(t);
  const dow = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  const [y, m] = t.split('-').map(Number);
  const monthStart = parseDay(`${y}-${String(m).padStart(2, '0')}-01`);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return {
    today: [today, addDays(today, 1)],
    week: [weekStart, addDays(weekStart, 7)],
    month: [monthStart, parseDay(next)],
  };
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive) into a [start, endExclusive) pair. */
function rangeFromQuery(q, defaultKey = 'month') {
  if (q.from && q.to) return [parseDay(q.from), addDays(parseDay(q.to), 1)];
  return ranges()[defaultKey];
}

module.exports = { TZ, todayStr, parseDay, addDays, dayStr, ranges, rangeFromQuery };
