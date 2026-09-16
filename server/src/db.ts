import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function ensureSchema() {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf-8');
  await pool.query(schema);
}

/** Midnight of (year, month, day) in `timeZone`, expressed as the equivalent UTC instant — computed
 * via a round-trip through Intl (no date library needed) so day boundaries respect DST correctly. */
function zonedMidnightUTC(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const hour = get('hour') % 24; // Intl can report "24" for midnight depending on locale/runtime
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  const offsetMs = asUTC - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/** [start, end) for "today" (or `daysAgo` days before today) in `timeZone`, as UTC instants — used
 * to bound zone_visits queries without relying on Postgres's own session timezone. */
export function dayRangeInZone(timeZone: string, daysAgo = 0): { start: Date; end: Date } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value) - daysAgo;
  return { start: zonedMidnightUTC(y, m, d, timeZone), end: zonedMidnightUTC(y, m, d + 1, timeZone) };
}

/** YYYY-MM-DD label for the day starting at `start` (a UTC instant produced by dayRangeInZone), in `timeZone`. */
export function dayLabel(start: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
}
