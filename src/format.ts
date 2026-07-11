/** Number, distance, duration, pace/speed, and relative-time formatting. */

import type { ActivityRow, Units } from './types';

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_FOOT = 0.3048;

export function formatNumber(n: number, locale: string, maxFractionDigits = 0): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(n);
  } catch {
    return n.toFixed(maxFractionDigits);
  }
}

export function formatDistance(meters: number, units: Units, locale: string): string {
  const v = units === 'imperial' ? meters / METERS_PER_MILE : meters / 1000;
  const digits = v >= 100 ? 0 : 1;
  return `${formatNumber(v, locale, digits)} ${units === 'imperial' ? 'mi' : 'km'}`;
}

export function formatElevation(meters: number, units: Units, locale: string): string {
  const v = units === 'imperial' ? meters / METERS_PER_FOOT : meters;
  return `${formatNumber(Math.round(v), locale)} ${units === 'imperial' ? 'ft' : 'm'}`;
}

/** Compact duration for stat rows: "3h 24m" or "45m". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Clock-style time from seconds: "5:30" or "1:02:45". Rounds to whole
 * seconds FIRST so 59.7 s renders as 1:00, never 0:60.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

/** Sports where average speed reads better than pace (a Ride shows km/h, a Run shows min/km). */
export function isSpeedSport(type: string): boolean {
  const t = type.toLowerCase();
  return ['ride', 'bike', 'velomobile', 'skate', 'sail', 'windsurf', 'kitesurf'].some((k) =>
    t.includes(k),
  );
}

export interface PaceOrSpeed {
  value: string;
  kind: 'pace' | 'speed';
}

export function formatPaceOrSpeed(row: ActivityRow, units: Units, locale: string): PaceOrSpeed | null {
  if (!(row.avgSpeed > 0)) return null;
  if (isSpeedSport(row.type)) {
    const speed = units === 'imperial' ? (row.avgSpeed * 3600) / METERS_PER_MILE : row.avgSpeed * 3.6;
    return {
      value: `${formatNumber(speed, locale, 1)} ${units === 'imperial' ? 'mph' : 'km/h'}`,
      kind: 'speed',
    };
  }
  const perUnit = units === 'imperial' ? METERS_PER_MILE : 1000;
  return {
    value: `${formatClock(perUnit / row.avgSpeed)} /${units === 'imperial' ? 'mi' : 'km'}`,
    kind: 'pace',
  };
}

/** Truncate by code points so emoji in activity names survive intact. */
export function truncate(str: string, max: number): string {
  const cps = Array.from(str);
  if (cps.length <= max) return str;
  return cps.slice(0, Math.max(0, max - 1)).join('') + '…';
}

/** "WeightTraining" → "Weight Training" for unknown/new sport types. */
export function prettySportType(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Language-native relative time via Intl.RelativeTimeFormat ("vor 2 Stunden",
 * "2 uur geleden"). Negative clock skew clamps to `justNow`.
 */
export function relativeTime(isoUtc: string, locale: string, now: Date, justNow: string): string {
  const then = new Date(isoUtc).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = (now.getTime() - then) / 1000;
  if (!(diff >= 60)) return justNow;
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  }
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of steps) {
    if (diff >= secs) return rtf.format(-Math.floor(diff / secs), unit);
  }
  return justNow;
}

const MARATHON_METERS = 42195;
const EVEREST_METERS = 8849;

/** Distance as marathon count with one decimal; null under half a marathon. */
export function marathonCount(meters: number): number | null {
  const n = meters / MARATHON_METERS;
  return n >= 0.5 ? Math.round(n * 10) / 10 : null;
}

/** Climbing as Everest count with one decimal; null under half an Everest. */
export function everestCount(meters: number): number | null {
  const n = meters / EVEREST_METERS;
  return n >= 0.5 ? Math.round(n * 10) / 10 : null;
}

/** Short weekday/date label for a recent activity ("today", "Thu", "Jun 21"). */
export function shortDayLabel(isoLocal: string, locale: string, now: Date, today: string): string {
  const key = isoLocal.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  if (key === todayKey) return today;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoLocal);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
  try {
    if (ageDays < 7) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
  } catch {
    return key;
  }
}

/** "Jun 21"-style date for records. */
export function shortDate(isoLocal: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoLocal);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
  } catch {
    return isoLocal.slice(0, 10);
  }
}

/** Signed delta like "+12.4" / "−3" in the display locale. */
export function formatSignedNumber(n: number, locale: string, maxFractionDigits = 1): string {
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: maxFractionDigits,
      signDisplay: 'always',
    }).format(n);
  } catch {
    return (n >= 0 ? '+' : '') + n.toFixed(maxFractionDigits);
  }
}

/** "First Last" → "FL" for the profile-photo fallback circle. */
export function initials(firstName: string, lastName: string): string {
  const first = Array.from(firstName.trim())[0] ?? '';
  const last = Array.from(lastName.trim())[0] ?? '';
  return (first + last).toUpperCase();
}
