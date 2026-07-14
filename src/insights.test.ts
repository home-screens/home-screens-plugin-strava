import { describe, expect, it } from 'vitest';
import { activeDays, activityRecords, kudosForRange, streaks, weeklyTotals } from './aggregate';
import { monthCalendarGrid } from './date-ranges';
import { everestCount, marathonCount, shortDayLabel } from './format';
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

// Thursday noon; ISO week Mon 2025-06-02 → Mon 2025-06-09
const NOW = new Date(2025, 5, 5, 12, 0);

describe('weeklyTotals', () => {
  it('returns the requested weeks oldest first, current week last', () => {
    const rows = [
      row({ startDateLocal: '2025-06-03T07:00:00Z', distance: 10 }), // current week
      row({ startDateLocal: '2025-05-28T07:00:00Z', distance: 20 }), // 1 week back (Wed)
      row({ startDateLocal: '2025-05-26T07:00:00Z', distance: 5 }), // 1 week back (Mon)
    ];
    const weeks = weeklyTotals(rows, 4, NOW);
    expect(weeks).toHaveLength(4);
    expect(weeks[3].isCurrent).toBe(true);
    expect(weeks[3].distance).toBe(10);
    expect(weeks[2].distance).toBe(25);
    expect(weeks[0].distance).toBe(0);
    expect(weeks[0].weekStart.getDay()).toBe(1);
  });
  it('a Sunday activity lands in the same week as its Monday', () => {
    const rows = [row({ startDateLocal: '2025-06-08T23:00:00Z', distance: 7 })]; // Sun of current week
    const weeks = weeklyTotals(rows, 2, NOW);
    expect(weeks[1].distance).toBe(7);
  });
});

describe('activityRecords', () => {
  it('classifies rides vs runs by substring and takes maxima', () => {
    const rows = [
      row({ type: 'GravelRide', distance: 90000, name: 'big ride' }),
      row({ type: 'Ride', distance: 50000 }),
      row({ type: 'TrailRun', distance: 21000, name: 'big run' }),
      row({ type: 'Run', distance: 8000 }),
    ];
    const rec = activityRecords(rows);
    expect(rec.longestRide?.name).toBe('big ride');
    expect(rec.longestRun?.name).toBe('big run');
  });
  it('fastest run requires at least 5 km', () => {
    const rows = [
      row({ type: 'Run', distance: 3000, avgSpeed: 5 }), // fast but too short
      row({ type: 'Run', distance: 8000, avgSpeed: 3.4, name: 'tempo' }),
      row({ type: 'Ride', distance: 40000, avgSpeed: 9 }), // rides never count
    ];
    expect(activityRecords(rows).fastestRun?.name).toBe('tempo');
  });
  it('omits records that do not exist', () => {
    const rec = activityRecords([row({ type: 'Yoga', distance: 0, elevation: 0, kudosCount: 0 })]);
    expect(rec.longestRide).toBeUndefined();
    expect(rec.longestRun).toBeUndefined();
    expect(rec.biggestClimb).toBeUndefined();
    expect(rec.mostKudos).toBeUndefined();
  });
});

describe('streaks', () => {
  it('counts the current streak back from today', () => {
    const rows = ['2025-06-05', '2025-06-04', '2025-06-03'].map((d) =>
      row({ startDateLocal: `${d}T07:00:00Z` }),
    );
    expect(streaks(rows, NOW).current).toBe(3);
  });
  it('a rest day so far today keeps yesterday-ending streaks alive', () => {
    const rows = ['2025-06-04', '2025-06-03'].map((d) => row({ startDateLocal: `${d}T07:00:00Z` }));
    expect(streaks(rows, NOW).current).toBe(2);
  });
  it('a gap before yesterday means no current streak', () => {
    const rows = [row({ startDateLocal: '2025-06-02T07:00:00Z' })];
    expect(streaks(rows, NOW).current).toBe(0);
  });
  it('finds the longest streak anywhere in the window', () => {
    const days = ['2025-03-01', '2025-03-02', '2025-03-03', '2025-03-04', '2025-06-05'];
    const rows = days.map((d) => row({ startDateLocal: `${d}T07:00:00Z` }));
    const s = streaks(rows, NOW);
    expect(s.longest).toBe(4);
    expect(s.current).toBe(1);
  });
});

describe('activeDays / kudosForRange', () => {
  const start = new Date(2025, 5, 1);
  const end = new Date(2025, 6, 1);
  it('counts distinct days, not activities', () => {
    const rows = [
      row({ startDateLocal: '2025-06-03T07:00:00Z' }),
      row({ startDateLocal: '2025-06-03T18:00:00Z' }),
      row({ startDateLocal: '2025-06-04T07:00:00Z' }),
      row({ startDateLocal: '2025-05-30T07:00:00Z' }), // outside
    ];
    expect(activeDays(rows, start, end)).toBe(2);
  });
  it('sums kudos within the range only', () => {
    const rows = [
      row({ startDateLocal: '2025-06-03T07:00:00Z', kudosCount: 5 }),
      row({ startDateLocal: '2025-05-30T07:00:00Z', kudosCount: 100 }),
    ];
    expect(kudosForRange(rows, start, end)).toBe(5);
  });
});

describe('monthCalendarGrid', () => {
  it('lays out July 2026 with Wednesday the 1st and 31 days', () => {
    const grid = monthCalendarGrid(new Date(2026, 6, 11, 12, 0));
    expect(grid[0][0]).toBeNull(); // Mon
    expect(grid[0][1]).toBeNull(); // Tue
    expect(grid[0][2]?.day).toBe(1); // Wed
    const days = grid.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    const today = days.find((c) => c!.isToday)!;
    expect(today.day).toBe(11);
    expect(days.filter((c) => c!.isFuture)).toHaveLength(20);
    // Trailing blanks complete the last week
    expect(grid[grid.length - 1]).toHaveLength(7);
  });
});

describe('equivalences', () => {
  it('marathons round to one decimal and hide under half', () => {
    expect(marathonCount(1_847_000)).toBe(43.8);
    expect(marathonCount(20_000)).toBeNull();
  });
  it('everests round to one decimal and hide under half', () => {
    expect(everestCount(14_580)).toBe(1.6);
    expect(everestCount(4_000)).toBeNull();
  });
});

describe('shortDayLabel', () => {
  const now = new Date(2025, 5, 5, 12, 0);
  it('says today for today', () => {
    expect(shortDayLabel('2025-06-05T07:00:00Z', 'en-US', now, 'today')).toBe('today');
  });
  it('uses a weekday inside the last week', () => {
    expect(shortDayLabel('2025-06-03T07:00:00Z', 'en-US', now, 'today')).toBe('Tue');
  });
  it('uses a short date beyond a week', () => {
    expect(shortDayLabel('2025-05-20T07:00:00Z', 'en-US', now, 'today')).toBe('May 20');
  });
});
