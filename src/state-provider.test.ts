import { describe, expect, it } from 'vitest';
import { selectPublishableKeys, planValues, planClears, planHealthReport } from './state-provider';
import type { ActivityRow } from './types';

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: Math.floor(Math.random() * 1e9),
    name: 'Activity',
    type: 'Run',
    startDate: '2025-06-05T12:00:00Z',
    startDateLocal: '2025-06-05T07:00:00Z',
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

const NOW = new Date(2025, 5, 5, 12, 0);
const ALL_KEYS = [
  'last_activity_type', 'last_activity_date', 'current_streak', 'days_since_last_activity', 'eddington_number',
];

describe('selectPublishableKeys', () => {
  it('keeps known Strava keys and drops everything else', () => {
    expect(selectPublishableKeys([...ALL_KEYS, 'typo_key', 'plugin:other:thing'])).toEqual(ALL_KEYS);
  });

  it('returns an empty array when nothing demanded matches', () => {
    expect(selectPublishableKeys(['not_a_strava_key'])).toEqual([]);
  });
});

describe('planValues', () => {
  it('derives every demanded key from the fetched rows, sorted newest first', () => {
    const rows = [
      // Listed oldest-first on purpose: proves last_activity_* picks the
      // most recent row by date, not just the first array entry.
      row({ type: 'Ride', startDate: '2025-06-04T12:00:00Z', startDateLocal: '2025-06-04T07:00:00Z' }),
      row({ type: 'Run', startDate: '2025-06-05T12:00:00Z', startDateLocal: '2025-06-05T07:00:00Z' }),
    ];
    const values = planValues(rows, ALL_KEYS, NOW, 'metric');
    expect(values.last_activity_type).toBe('Run');
    expect(values.last_activity_date).toBe('2025-06-05');
    expect(values.current_streak).toBe('2');
    expect(values.days_since_last_activity).toBe('0');
    expect(values.eddington_number).toBe('2');
  });

  it('only computes keys that are actually demanded', () => {
    const rows = [row()];
    const values = planValues(rows, ['current_streak'], NOW, 'metric');
    expect(Object.keys(values)).toEqual(['current_streak']);
  });

  it('omits activity-derived keys entirely when there are no activities', () => {
    const values = planValues([], ALL_KEYS, NOW, 'metric');
    expect(values.last_activity_type).toBeUndefined();
    expect(values.last_activity_date).toBeUndefined();
    expect(values.days_since_last_activity).toBeUndefined();
    // streak and Eddington are still meaningful at zero.
    expect(values.current_streak).toBe('0');
    expect(values.eddington_number).toBe('0');
  });
});

describe('planClears', () => {
  it('clears published keys that dropped out of the demand set', () => {
    const published = new Set(['current_streak', 'eddington_number']);
    expect(planClears(published, ['current_streak'])).toEqual(['eddington_number']);
  });

  it('clears everything when the demand set is empty (disconnect)', () => {
    const published = new Set(['current_streak', 'last_activity_type']);
    expect(planClears(published, [])).toEqual(['current_streak', 'last_activity_type']);
  });

  it('clears nothing when every published key is still demanded', () => {
    const published = new Set(['current_streak']);
    expect(planClears(published, ['current_streak', 'eddington_number'])).toEqual([]);
  });
});

describe('planHealthReport', () => {
  it('opens an outage and reports not-ok on the first failure', () => {
    const { report, outage } = planHealthReport(null, { ok: false, message: "Can't reach Strava", at: 1000 });
    expect(report).toEqual({ ok: false, message: "Can't reach Strava", since: 1000 });
    expect(outage).toEqual({ since: 1000 });
  });

  it('stays silent on a repeated failure, keeping the original since', () => {
    const prevOutage = { since: 1000 };
    const { report, outage } = planHealthReport(prevOutage, { ok: false, message: 'still down', at: 2000 });
    expect(report).toBeNull();
    expect(outage).toEqual({ since: 1000 });
  });

  it('reports ok once on recovery and closes the outage', () => {
    const prevOutage = { since: 1000 };
    const { report, outage } = planHealthReport(prevOutage, { ok: true });
    expect(report).toEqual({ ok: true });
    expect(outage).toBeNull();
  });

  it('stays silent while already healthy', () => {
    const { report, outage } = planHealthReport(null, { ok: true });
    expect(report).toBeNull();
    expect(outage).toBeNull();
  });
});
