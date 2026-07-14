import { describe, expect, it } from 'vitest';
import {
  bucketByDay,
  cumulativeYear,
  eddington,
  filterActivities,
  fitnessSeries,
  goalProgress,
  heatmapValue,
  hourDistribution,
  nextMilestone,
  sortNewestFirst,
  tierFor,
  toGoalUnits,
  totalsForPeriod,
  weekdayDistribution,
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
    isRace: false,
    commute: false,
    trainer: false,
    photoCount: 0,
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
  it('drops commutes when excludeCommutes is set, in both filter modes', () => {
    const rows = [
      row({ type: 'Ride', commute: true }),
      row({ type: 'Ride' }),
      row({ type: 'Run', commute: true }),
    ];
    expect(filterActivities(rows, 'all', true)).toHaveLength(1);
    expect(filterActivities(rows, 'Ride', true)).toHaveLength(1);
    expect(filterActivities(rows, 'all', false)).toHaveLength(3);
  });
});

describe('eddington', () => {
  it('finds the largest E with E activities of at least E units', () => {
    // Distances in km: 5, 4, 3, 1 → E=3 (three activities ≥ 3 km)
    const rows = [5000, 4000, 3000, 1000].map((d) => row({ distance: d }));
    const e = eddington(rows, 'metric');
    expect(e.number).toBe(3);
    // Next is 4: two activities are ≥ 4 km, so two more are needed
    expect(e.towardNext).toBe(2);
    expect(e.neededForNext).toBe(2);
  });
  it('is unit-aware: the same rows read lower in miles', () => {
    const rows = [5000, 4000, 3000, 1000].map((d) => row({ distance: d }));
    expect(eddington(rows, 'imperial').number).toBe(2);
  });
  it('is 0 with no qualifying activities', () => {
    expect(eddington([row({ distance: 500 })], 'metric').number).toBe(0);
    expect(eddington([], 'metric').neededForNext).toBe(1);
  });
});

describe('cumulativeYear', () => {
  it('accumulates distance by day of the year up to today', () => {
    const rows = [
      row({ startDateLocal: '2025-01-01T07:00:00Z', distance: 1000 }),
      row({ startDateLocal: '2025-01-03T07:00:00Z', distance: 2000 }),
      row({ startDateLocal: '2025-06-05T07:00:00Z', distance: 4000 }),
    ];
    const series = cumulativeYear(rows, 2025, NOW); // NOW is 2025-06-05
    expect(series).toHaveLength(156); // Jan 1 … Jun 5
    expect(series[0]).toBe(1000);
    expect(series[1]).toBe(1000);
    expect(series[2]).toBe(3000);
    expect(series[series.length - 1]).toBe(7000);
  });
  it('covers a full past year and ignores other years', () => {
    const rows = [
      row({ startDateLocal: '2024-12-31T07:00:00Z', distance: 5000 }),
      row({ startDateLocal: '2025-01-01T07:00:00Z', distance: 1000 }),
    ];
    const series = cumulativeYear(rows, 2024, NOW);
    expect(series).toHaveLength(366); // 2024 is a leap year
    expect(series[365]).toBe(5000);
  });
});

describe('fitnessSeries', () => {
  it('spikes fatigue above fitness right after a big day, so form goes negative', () => {
    const rows = [row({ startDateLocal: '2025-06-04T07:00:00Z', sufferScore: 200 })];
    const series = fitnessSeries(rows, NOW, 30);
    const last = series[series.length - 1];
    expect(last.fatigue).toBeGreaterThan(last.fitness);
    expect(last.form).toBeLessThan(0);
  });
  it('returns at most the requested number of days', () => {
    const rows = [row({ startDateLocal: '2025-01-01T07:00:00Z' })];
    expect(fitnessSeries(rows, NOW, 90)).toHaveLength(90);
    expect(fitnessSeries([], NOW, 90).length).toBeLessThanOrEqual(90);
  });
  it('falls back to a duration-based load without a suffer score', () => {
    const rows = [row({ startDateLocal: '2025-06-05T07:00:00Z', movingTime: 7200 })];
    const last = fitnessSeries(rows, NOW, 1)[0];
    expect(last.fatigue).toBeGreaterThan(0); // 2 h ≈ load 60 decayed once
  });
});

describe('nextMilestone', () => {
  it('uses 1000-steps for five-digit values (the 12,480 → 13,000 case)', () => {
    const m = nextMilestone(12_480);
    expect(m.target).toBe(13_000);
    expect(m.remaining).toBe(520);
    expect(m.fraction).toBeCloseTo(0.48);
  });
  it('scales the step down for smaller values', () => {
    expect(nextMilestone(812).target).toBe(900);
    expect(nextMilestone(4_200).target).toBe(4_500);
    expect(nextMilestone(61).target).toBe(100);
  });
  it('never returns the current value as the target', () => {
    expect(nextMilestone(1000).target).toBe(1100);
  });
});

describe('weekday and hour distributions', () => {
  it('buckets by local weekday, Monday first', () => {
    const rows = [
      row({ startDateLocal: '2025-06-02T07:00:00Z', movingTime: 100 }), // Monday
      row({ startDateLocal: '2025-06-02T18:00:00Z', movingTime: 200 }), // Monday
      row({ startDateLocal: '2025-06-08T09:00:00Z', movingTime: 300 }), // Sunday
    ];
    const dist = weekdayDistribution(rows);
    expect(dist[0]).toEqual({ count: 2, movingTime: 300 });
    expect(dist[6]).toEqual({ count: 1, movingTime: 300 });
    expect(dist[3].count).toBe(0);
  });
  it('buckets by local start hour', () => {
    const rows = [
      row({ startDateLocal: '2025-06-02T06:15:00Z' }),
      row({ startDateLocal: '2025-06-03T06:45:00Z' }),
      row({ startDateLocal: '2025-06-04T18:05:00Z' }),
    ];
    const dist = hourDistribution(rows);
    expect(dist[6].count).toBe(2);
    expect(dist[18].count).toBe(1);
    expect(dist[12].count).toBe(0);
  });
  it('skips unparseable dates', () => {
    expect(weekdayDistribution([row({ startDateLocal: 'bogus' })]).every((b) => b.count === 0)).toBe(true);
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
