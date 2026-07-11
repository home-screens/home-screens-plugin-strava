/** Client-side aggregation: filtering, period totals, goals, heatmap buckets. */

import type { ActivityRow, HeatmapMetric, StravaGoal, Units } from './types';
import {
  addDays,
  dayKey,
  dayKeyFromIso,
  parseLocalIso,
  periodBounds,
  periodElapsedFraction,
  startOfIsoWeek,
} from './date-ranges';
import { METERS_PER_FOOT, METERS_PER_MILE } from './format';

/** Case-insensitive substring filter: "Run" matches TrailRun and VirtualRun. */
export function filterActivities(rows: ActivityRow[], filter: string): ActivityRow[] {
  if (!filter || filter === 'all') return rows;
  const f = filter.toLowerCase();
  return rows.filter((r) => r.type.toLowerCase().includes(f));
}

export interface PeriodTotals {
  count: number;
  /** Meters */
  distance: number;
  /** Seconds */
  movingTime: number;
  /** Meters */
  elevation: number;
}

export function emptyTotals(): PeriodTotals {
  return { count: 0, distance: 0, movingTime: 0, elevation: 0 };
}

/** Sum rows whose local start time falls in [start, end). */
export function totalsForRange(rows: ActivityRow[], start: Date, end: Date): PeriodTotals {
  const totals = emptyTotals();
  for (const r of rows) {
    const d = parseLocalIso(r.startDateLocal);
    if (isNaN(d.getTime()) || d < start || d >= end) continue;
    totals.count++;
    totals.distance += r.distance;
    totals.movingTime += r.movingTime;
    totals.elevation += r.elevation;
  }
  return totals;
}

export function totalsForPeriod(rows: ActivityRow[], period: 'week' | 'year', now: Date): PeriodTotals {
  const { start, end } = periodBounds(period, now);
  return totalsForRange(rows, start, end);
}

/** Convert an SI metric sum into the goal's natural units (km/mi, hours, m/ft). */
export function toGoalUnits(metric: StravaGoal['metric'], si: number, units: Units): number {
  if (metric === 'distance') return units === 'imperial' ? si / METERS_PER_MILE : si / 1000;
  if (metric === 'movingTime') return si / 3600;
  return units === 'imperial' ? si / METERS_PER_FOOT : si;
}

export interface GoalProgress {
  /** In the goal's natural units */
  current: number;
  target: number;
  /** current/target clamped to [0, 1] */
  fraction: number;
  /** Linear projection to period end; null when <1% of the period has elapsed. */
  projected: number | null;
  /** null while projection is skipped */
  onTrack: boolean | null;
  elapsedFraction: number;
}

export function goalProgress(
  rows: ActivityRow[],
  goal: StravaGoal,
  units: Units,
  now: Date,
): GoalProgress {
  const totals = totalsForPeriod(rows, goal.period, now);
  const si =
    goal.metric === 'distance'
      ? totals.distance
      : goal.metric === 'movingTime'
        ? totals.movingTime
        : totals.elevation;
  const current = toGoalUnits(goal.metric, si, units);
  const target = goal.target;
  const fraction = target > 0 ? Math.min(1, current / target) : 0;
  const elapsedFraction = periodElapsedFraction(goal.period, now);
  // A projection off the first sliver of a period is noise, not signal.
  if (elapsedFraction < 0.01) {
    return { current, target, fraction, projected: null, onTrack: null, elapsedFraction };
  }
  const projected = current / elapsedFraction;
  // Epsilon so someone pacing exactly to target reads "on track", not "behind".
  const onTrack = target > 0 ? projected >= target * 0.995 : true;
  return { current, target, fraction, projected, onTrack, elapsedFraction };
}

/** Bucket rows once by local day key so heatmap cell lookups are O(1). */
export function bucketByDay(rows: ActivityRow[]): Map<string, PeriodTotals> {
  const buckets = new Map<string, PeriodTotals>();
  for (const r of rows) {
    const key = dayKeyFromIso(r.startDateLocal);
    let totals = buckets.get(key);
    if (!totals) {
      totals = emptyTotals();
      buckets.set(key, totals);
    }
    totals.count++;
    totals.distance += r.distance;
    totals.movingTime += r.movingTime;
    totals.elevation += r.elevation;
  }
  return buckets;
}

export function heatmapValue(totals: PeriodTotals | undefined, metric: HeatmapMetric): number {
  if (!totals) return 0;
  if (metric === 'count') return totals.count;
  if (metric === 'distance') return totals.distance;
  return totals.movingTime;
}

/** 5-tier intensity with strict < boundaries; tier 0 is "no activity". */
export function tierFor(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const q = value / max;
  if (q < 0.25) return 1;
  if (q < 0.5) return 2;
  if (q < 0.75) return 3;
  return 4;
}

/** Newest-first sort by UTC start; the API usually returns this order, but don't rely on it. */
export function sortNewestFirst(rows: ActivityRow[]): ActivityRow[] {
  return [...rows].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}

export interface WeekTotals extends PeriodTotals {
  /** Monday 00:00 of the week */
  weekStart: Date;
  isCurrent: boolean;
}

/**
 * Totals for the last `weeks` ISO weeks including the current (partial) one,
 * oldest first. Single pass: rows are bucketed by their week's Monday key.
 */
export function weeklyTotals(rows: ActivityRow[], weeks: number, now: Date): WeekTotals[] {
  const thisMonday = startOfIsoWeek(now);
  const byMonday = new Map<string, PeriodTotals>();
  for (const r of rows) {
    const d = parseLocalIso(r.startDateLocal);
    if (isNaN(d.getTime())) continue;
    const key = dayKey(startOfIsoWeek(d));
    let totals = byMonday.get(key);
    if (!totals) {
      totals = emptyTotals();
      byMonday.set(key, totals);
    }
    totals.count++;
    totals.distance += r.distance;
    totals.movingTime += r.movingTime;
    totals.elevation += r.elevation;
  }
  const out: WeekTotals[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = addDays(thisMonday, -7 * w);
    const totals = byMonday.get(dayKey(weekStart)) ?? emptyTotals();
    out.push({ ...totals, weekStart, isCurrent: w === 0 });
  }
  return out;
}

export interface ActivityRecords {
  longestRide?: ActivityRow;
  longestRun?: ActivityRow;
  biggestClimb?: ActivityRow;
  /** Run of at least 5 km with the fastest average pace */
  fastestRun?: ActivityRow;
  mostKudos?: ActivityRow;
}

const MIN_RECORD_RUN_METERS = 5000;

function isRun(type: string): boolean {
  return type.toLowerCase().includes('run');
}

function isRide(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('ride') || t.includes('bike');
}

/** Bests across the given rows (the fetch window is ~12 months). */
export function activityRecords(rows: ActivityRow[]): ActivityRecords {
  const rec: ActivityRecords = {};
  for (const r of rows) {
    if (isRide(r.type) && r.distance > (rec.longestRide?.distance ?? 0)) rec.longestRide = r;
    if (isRun(r.type) && r.distance > (rec.longestRun?.distance ?? 0)) rec.longestRun = r;
    if (r.elevation > (rec.biggestClimb?.elevation ?? 0)) rec.biggestClimb = r;
    if (isRun(r.type) && r.distance >= MIN_RECORD_RUN_METERS && r.avgSpeed > 0) {
      if (!rec.fastestRun || r.avgSpeed > rec.fastestRun.avgSpeed) rec.fastestRun = r;
    }
    if (r.kudosCount > (rec.mostKudos?.kudosCount ?? 0)) rec.mostKudos = r;
  }
  if ((rec.biggestClimb?.elevation ?? 0) <= 0) delete rec.biggestClimb;
  return rec;
}

export interface Streaks {
  /** Consecutive active days ending today (or yesterday, if today is still rest so far) */
  current: number;
  longest: number;
}

/** Active-day streaks over the fetched window, by local day. */
export function streaks(rows: ActivityRow[], now: Date): Streaks {
  const active = new Set<string>();
  for (const r of rows) {
    const key = dayKeyFromIso(r.startDateLocal);
    if (key) active.add(key);
  }
  // Current: walk back from today; a rest day so far today doesn't break a
  // streak that ran through yesterday.
  let current = 0;
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!active.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  while (active.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }
  // Longest: walk each streak from its first day only.
  let longest = 0;
  for (const key of active) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (active.has(dayKey(addDays(date, -1)))) continue;
    let len = 0;
    let walk = date;
    while (active.has(dayKey(walk))) {
      len++;
      walk = addDays(walk, 1);
    }
    if (len > longest) longest = len;
  }
  return { current, longest };
}

/** Distinct active local days within [start, end). */
export function activeDays(rows: ActivityRow[], start: Date, end: Date): number {
  const days = new Set<string>();
  for (const r of rows) {
    const d = parseLocalIso(r.startDateLocal);
    if (isNaN(d.getTime()) || d < start || d >= end) continue;
    days.add(dayKeyFromIso(r.startDateLocal));
  }
  return days.size;
}

/** Kudos received within [start, end). */
export function kudosForRange(rows: ActivityRow[], start: Date, end: Date): number {
  let total = 0;
  for (const r of rows) {
    const d = parseLocalIso(r.startDateLocal);
    if (isNaN(d.getTime()) || d < start || d >= end) continue;
    total += r.kudosCount;
  }
  return total;
}
