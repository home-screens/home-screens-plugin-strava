import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDistance,
  formatDuration,
  formatPaceOrSpeed,
  initials,
  isSpeedSport,
  prettySportType,
  relativeTime,
  truncate,
} from './format';
import type { ActivityRow } from './types';

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 1,
    name: 'Morning Run',
    type: 'Run',
    startDate: '2025-06-05T12:00:00Z',
    startDateLocal: '2025-06-05T07:00:00Z',
    distance: 10000,
    movingTime: 3000,
    elapsedTime: 3100,
    elevation: 50,
    avgSpeed: 3.3333,
    kudosCount: 0,
    prCount: 0,
    achievementCount: 0,
    ...overrides,
  };
}

describe('formatClock', () => {
  it('renders 59.7 seconds as 1:00, never 0:60', () => {
    expect(formatClock(59.7)).toBe('1:00');
  });
  it('renders hours when present', () => {
    expect(formatClock(3765)).toBe('1:02:45');
  });
  it('pads seconds', () => {
    expect(formatClock(305)).toBe('5:05');
  });
});

describe('formatDuration', () => {
  it('shows hours and minutes', () => {
    expect(formatDuration(12240)).toBe('3h 24m');
  });
  it('shows minutes only under an hour', () => {
    expect(formatDuration(2700)).toBe('45m');
  });
  it('rounds 59.6 minutes up into the hour form', () => {
    expect(formatDuration(3576)).toBe('1h 0m');
  });
});

describe('formatDistance', () => {
  it('formats km with one decimal under 100', () => {
    expect(formatDistance(12345, 'metric', 'en-US')).toBe('12.3 km');
  });
  it('formats miles', () => {
    expect(formatDistance(1609.344 * 5, 'imperial', 'en-US')).toBe('5 mi');
  });
  it('drops decimals at 100+', () => {
    expect(formatDistance(123456, 'metric', 'en-US')).toBe('123 km');
  });
});

describe('formatPaceOrSpeed', () => {
  it('shows pace for a run', () => {
    const r = row({ type: 'Run', avgSpeed: 1000 / 300 });
    expect(formatPaceOrSpeed(r, 'metric', 'en-US')).toEqual({ value: '5:00 /km', kind: 'pace' });
  });
  it('shows speed for a ride', () => {
    const r = row({ type: 'Ride', avgSpeed: 30 / 3.6 });
    expect(formatPaceOrSpeed(r, 'metric', 'en-US')).toEqual({ value: '30 km/h', kind: 'speed' });
  });
  it('guards the pace overflow: 59.7 s/km renders 1:00 /km', () => {
    const r = row({ type: 'Run', avgSpeed: 1000 / 59.7 });
    expect(formatPaceOrSpeed(r, 'metric', 'en-US')?.value).toBe('1:00 /km');
  });
  it('returns null when speed is zero or missing', () => {
    expect(formatPaceOrSpeed(row({ avgSpeed: 0 }), 'metric', 'en-US')).toBeNull();
  });
  it('speed sports match by substring (VirtualRide, EBikeRide)', () => {
    expect(isSpeedSport('VirtualRide')).toBe(true);
    expect(isSpeedSport('EBikeRide')).toBe(true);
    expect(isSpeedSport('TrailRun')).toBe(false);
  });
});

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('Morning Run', 20)).toBe('Morning Run');
  });
  it('counts code points so emoji survive', () => {
    expect(truncate('🏃🏃🏃🏃', 3)).toBe('🏃🏃…');
  });
  it('never splits a surrogate pair', () => {
    const out = truncate('run 🚴 with friends and more words', 6);
    expect(out).toBe('run 🚴…');
  });
});

describe('prettySportType', () => {
  it('splits camel case', () => {
    expect(prettySportType('WeightTraining')).toBe('Weight Training');
    expect(prettySportType('EBikeRide')).toBe('EBike Ride');
    expect(prettySportType('Padel')).toBe('Padel');
  });
});

describe('relativeTime', () => {
  const now = new Date('2025-06-05T12:00:00Z');
  it('uses language-native phrasing', () => {
    expect(relativeTime('2025-06-05T10:00:00Z', 'en-US', now, 'just now')).toBe('2 hours ago');
    expect(relativeTime('2025-06-04T08:00:00Z', 'en-US', now, 'just now')).toBe('yesterday');
    expect(relativeTime('2025-06-05T10:00:00Z', 'de-DE', now, 'gerade eben')).toBe(
      'vor 2 Stunden',
    );
  });
  it('clamps negative clock skew to just now', () => {
    expect(relativeTime('2025-06-05T12:05:00Z', 'en-US', now, 'just now')).toBe('just now');
  });
  it('treats under a minute as just now', () => {
    expect(relativeTime('2025-06-05T11:59:30Z', 'en-US', now, 'just now')).toBe('just now');
  });
});

describe('initials', () => {
  it('takes first code point of each name', () => {
    expect(initials('Ada', 'Lovelace')).toBe('AL');
  });
  it('handles missing parts', () => {
    expect(initials('Ada', '')).toBe('A');
  });
});
