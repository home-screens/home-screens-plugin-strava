/**
 * Local-date math for bucketing activities into days, ISO weeks, and years.
 *
 * All computation uses getFullYear/getMonth/getDate on local Date parts —
 * never toISOString, which shifts day boundaries across UTC.
 */

import type { GoalPeriod } from './types';

/**
 * Parse Strava's start_date_local. It carries a misleading "Z" suffix; the
 * clock fields are athlete-local wall time, so we take the components and
 * ignore the zone.
 */
export function parseLocalIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Day key straight off an ISO local timestamp — no Date round-trip. */
export function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

/** Monday 00:00 of the ISO week containing d. */
export function startOfIsoWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

/** Day arithmetic through the Date constructor so DST transitions can't skew it. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export interface PeriodBounds {
  start: Date;
  end: Date;
}

export function periodBounds(period: GoalPeriod, now: Date): PeriodBounds {
  if (period === 'week') {
    const start = startOfIsoWeek(now);
    return { start, end: addDays(start, 7) };
  }
  return { start: startOfYear(now), end: new Date(now.getFullYear() + 1, 0, 1) };
}

/** Fraction of the period already elapsed at `now`, clamped to [0, 1]. */
export function periodElapsedFraction(period: GoalPeriod, now: Date): number {
  const { start, end } = periodBounds(period, now);
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total));
}

export interface MonthCell {
  /** Day-of-month number */
  day: number;
  key: string;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Monday-start calendar grid for the month containing `now`: one row per
 * week, `null` for leading/trailing cells outside the month.
 */
export function monthCalendarGrid(now: Date): (MonthCell | null)[][] {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const todayKey = dayKey(now);
  const cells: (MonthCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dayKey(new Date(now.getFullYear(), now.getMonth(), day));
    cells.push({ day, key, isToday: key === todayKey, isFuture: key > todayKey });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (MonthCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Day-key grid for the heatmap: `weeks` columns of 7 keys, Monday first,
 * oldest week on the left, current (partial) week rightmost.
 */
export function heatmapDayGrid(now: Date, weeks = 52): string[][] {
  const thisMonday = startOfIsoWeek(now);
  const cols: string[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = addDays(thisMonday, -7 * w);
    cols.push(Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i))));
  }
  return cols;
}
