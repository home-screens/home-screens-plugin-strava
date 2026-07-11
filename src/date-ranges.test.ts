import { describe, expect, it } from 'vitest';
import {
  dayKey,
  heatmapDayGrid,
  parseLocalIso,
  periodBounds,
  periodElapsedFraction,
  startOfIsoWeek,
} from './date-ranges';

describe('parseLocalIso', () => {
  it('reads clock fields and ignores the misleading Z suffix', () => {
    const d = parseLocalIso('2025-06-05T07:12:30Z');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(12);
  });
  it('returns an invalid date for garbage', () => {
    expect(isNaN(parseLocalIso('not a date').getTime())).toBe(true);
  });
});

describe('startOfIsoWeek', () => {
  it('returns the same day for a Monday', () => {
    expect(dayKey(startOfIsoWeek(new Date(2025, 5, 2, 15, 0)))).toBe('2025-06-02');
  });
  it('returns the previous Monday for a Sunday', () => {
    expect(dayKey(startOfIsoWeek(new Date(2025, 5, 8, 1, 0)))).toBe('2025-06-02');
  });
  it('crosses month boundaries', () => {
    expect(dayKey(startOfIsoWeek(new Date(2025, 6, 1)))).toBe('2025-06-30');
  });
});

describe('periodBounds', () => {
  it('week runs Monday to Monday', () => {
    const { start, end } = periodBounds('week', new Date(2025, 5, 5, 12, 0));
    expect(dayKey(start)).toBe('2025-06-02');
    expect(dayKey(end)).toBe('2025-06-09');
  });
  it('year runs Jan 1 to Jan 1', () => {
    const { start, end } = periodBounds('year', new Date(2025, 5, 5));
    expect(dayKey(start)).toBe('2025-01-01');
    expect(dayKey(end)).toBe('2026-01-01');
  });
});

describe('periodElapsedFraction', () => {
  it('is 0.5 at Thursday noon of a week', () => {
    expect(periodElapsedFraction('week', new Date(2025, 5, 5, 12, 0))).toBeCloseTo(0.5, 5);
  });
  it('is tiny just after New Year', () => {
    expect(periodElapsedFraction('year', new Date(2025, 0, 1, 12, 0))).toBeLessThan(0.01);
  });
});

describe('heatmapDayGrid', () => {
  const now = new Date(2025, 5, 5, 12, 0); // Thursday
  const grid = heatmapDayGrid(now, 52);
  it('has 52 columns of 7 days', () => {
    expect(grid).toHaveLength(52);
    for (const col of grid) expect(col).toHaveLength(7);
  });
  it('every column starts on a Monday', () => {
    for (const col of grid) {
      const first = parseLocalIso(`${col[0]}T00:00:00Z`);
      expect(first.getDay()).toBe(1);
    }
  });
  it('the last column is the current week and contains today', () => {
    expect(grid[51][0]).toBe('2025-06-02');
    expect(grid[51]).toContain('2025-06-05');
  });
  it('the first column is 51 weeks before the current week', () => {
    expect(grid[0][0]).toBe('2024-06-10');
  });
});
