import { describe, expect, it } from 'vitest';
import {
  bucketByDay,
  filterActivities,
  goalProgress,
  heatmapValue,
  sortNewestFirst,
  tierFor,
  toGoalUnits,
  totalsForPeriod,
} from './aggregate';
import type { ActivityRow } from './types';

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: Math.floor(Math.random() * 1e9),
    name: 'Activity',
    type: 'Run',
    startDate: '2025-06-03T12:00:00Z',
    startDateLocal: '2025-06-03T07:00:00Z',
    distance: 10000,
    movingTime: 3600,
    elapsedTime: 3700,
    elevation: 100,
    avgSpeed: 3,
    kudosCount: 0,
    prCount: 0,
    achievementCount: 0,
    ...overrides,
  };
}

// Thursday noon; the ISO week is Mon 2025-06-02 → Mon 2025-06-09
const NOW = new Date(2025, 5, 5, 12, 0);

describe('filterActivities', () => {
  it('matches case-insensitive substrings, so "Run" includes trail and virtual runs', () => {
    const rows = [
      row({ type: 'Run' }),
      row({ type: 'TrailRun' }),
      row({ type: 'VirtualRun' }),
      row({ type: 'Ride' }),
    ];
    expect(filterActivities(rows, 'Run')).toHaveLength(3);
    expect(filterActivities(rows, 'run')).toHaveLength(3);
  });
  it('passes everything for "all" or empty', () => {
    const rows = [row({ type: 'Run' }), row({ type: 'Padel' })];
    expect(filterActivities(rows, 'all')).toHaveLength(2);
    expect(filterActivities(rows, '')).toHaveLength(2);
  });
});

describe('totalsForPeriod', () => {
  it('buckets by athlete-local wall time with Monday-start weeks', () => {
    const rows = [
      row({ startDateLocal: '2025-06-01T23:59:59Z', distance: 1 }), // Sunday before — out
      row({ startDateLocal: '2025-06-02T00:00:00Z', distance: 10 }), // Monday 00:00 — in
      row({ startDateLocal: '2025-06-05T07:00:00Z', distance: 100 }), // Thursday — in
    ];
    const totals = totalsForPeriod(rows, 'week', NOW);
    expect(totals.count).toBe(2);
    expect(totals.distance).toBe(110);
  });
  it('year period spans the calendar year', () => {
    const rows = [
      row({ startDateLocal: '2024-12-31T23:00:00Z', distance: 1 }),
      row({ startDateLocal: '2025-01-01T00:00:00Z', distance: 10 }),
    ];
    expect(totalsForPeriod(rows, 'year', NOW).distance).toBe(10);
  });
  it('skips rows with unparseable dates', () => {
    expect(totalsForPeriod([row({ startDateLocal: 'bogus' })], 'week', NOW).count).toBe(0);
  });
});

describe('toGoalUnits', () => {
  it('converts distance to km or miles', () => {
    expect(toGoalUnits('distance', 5000, 'metric')).toBeCloseTo(5);
    expect(toGoalUnits('distance', 1609.344, 'imperial')).toBeCloseTo(1);
  });
  it('converts moving time to hours', () => {
    expect(toGoalUnits('movingTime', 5400, 'metric')).toBeCloseTo(1.5);
  });
  it('converts elevation to feet for imperial', () => {
    expect(toGoalUnits('elevation', 304.8, 'imperial')).toBeCloseTo(1000);
  });
});

describe('goalProgress', () => {
  it('reads on track exactly at the 0.995 epsilon', () => {
    // Half the week elapsed, 49.75 km done → projected 99.5 = 100 × 0.995
    const rows = [row({ startDateLocal: '2025-06-03T07:00:00Z', distance: 49750 })];
    const goal = { metric: 'distance' as const, period: 'week' as const, target: 100 };
    const p = goalProgress(rows, goal, 'metric', NOW);
    expect(p.projected).toBeCloseTo(99.5);
    expect(p.onTrack).toBe(true);
  });
  it('reads behind just under the epsilon', () => {
    const rows = [row({ startDateLocal: '2025-06-03T07:00:00Z', distance: 49600 })];
    const goal = { metric: 'distance' as const, period: 'week' as const, target: 100 };
    expect(goalProgress(rows, goal, 'metric', NOW).onTrack).toBe(false);
  });
  it('skips the projection entirely when under 1% of the period has elapsed', () => {
    const janFirst = new Date(2025, 0, 1, 12, 0);
    const goal = { metric: 'distance' as const, period: 'year' as const, target: 1000 };
    const p = goalProgress([], goal, 'metric', janFirst);
    expect(p.projected).toBeNull();
    expect(p.onTrack).toBeNull();
  });
  it('clamps the ring fraction to 1 when the target is beaten', () => {
    const rows = [row({ distance: 250000 })];
    const goal = { metric: 'distance' as const, period: 'week' as const, target: 100 };
    expect(goalProgress(rows, goal, 'metric', NOW).fraction).toBe(1);
  });
});

describe('bucketByDay / heatmapValue', () => {
  it('buckets by the local day key and sums per day', () => {
    const rows = [
      row({ startDateLocal: '2025-06-03T07:00:00Z', distance: 5000, movingTime: 1800 }),
      row({ startDateLocal: '2025-06-03T18:00:00Z', distance: 3000, movingTime: 1200 }),
      row({ startDateLocal: '2025-06-04T07:00:00Z', distance: 1000, movingTime: 600 }),
    ];
    const buckets = bucketByDay(rows);
    expect(heatmapValue(buckets.get('2025-06-03'), 'count')).toBe(2);
    expect(heatmapValue(buckets.get('2025-06-03'), 'distance')).toBe(8000);
    expect(heatmapValue(buckets.get('2025-06-03'), 'movingTime')).toBe(3000);
    expect(heatmapValue(buckets.get('2025-06-05'), 'count')).toBe(0);
  });
});

describe('tierFor', () => {
  it('uses strict < boundaries across the 5 tiers', () => {
    expect(tierFor(0, 100)).toBe(0);
    expect(tierFor(24.9, 100)).toBe(1);
    expect(tierFor(25, 100)).toBe(2); // exactly 0.25 promotes
    expect(tierFor(49.9, 100)).toBe(2);
    expect(tierFor(50, 100)).toBe(3);
    expect(tierFor(75, 100)).toBe(4);
    expect(tierFor(100, 100)).toBe(4);
  });
  it('is 0 when there is no max', () => {
    expect(tierFor(5, 0)).toBe(0);
  });
});

describe('sortNewestFirst', () => {
  it('orders by UTC start descending without mutating the input', () => {
    const older = row({ startDate: '2025-06-01T12:00:00Z' });
    const newer = row({ startDate: '2025-06-04T12:00:00Z' });
    const input = [older, newer];
    const sorted = sortNewestFirst(input);
    expect(sorted[0]).toBe(newer);
    expect(input[0]).toBe(older);
  });
});
