/**
 * Strava API access through the host's plugin proxy. The proxy injects the
 * OAuth bearer token (manifest auth block), refreshes it serialized across
 * tabs/displays, retries once on 401, and caches responses per URL — so
 * screen rotation and multiple module instances share requests.
 */

import type { ActivityRow, ActivityTotals, AthleteProfile, AthleteStats } from './types';

export const PLUGIN_ID = 'strava';

/**
 * Strava is migrating to https://www.api-v3.strava.com (mandatory Jun 1,
 * 2027). Both hosts are pre-allowlisted in the manifest, so the migration is
 * a one-line change here.
 */
export const API_BASE = 'https://www.strava.com/api/v3';

const CACHE_TTL_MS = 600_000;
const ACTIVITY_WINDOW_DAYS = 366;
const PER_PAGE = 200;
const MAX_PAGES = 3;

export class StravaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'StravaApiError';
    this.status = status;
  }
}

export function isAuthError(err: unknown): boolean {
  return err instanceof StravaApiError && (err.status === 401 || err.status === 403);
}

async function stravaGet<T>(path: string): Promise<T> {
  const sdk = typeof window !== 'undefined' ? window.__HS_SDK__ : undefined;
  if (!sdk) throw new Error('Home Screens SDK unavailable');
  const res = await sdk.pluginFetch(PLUGIN_ID, {
    url: `${API_BASE}${path}`,
    cacheTtlMs: CACHE_TTL_MS,
  });
  if (!res.ok) throw new StravaApiError(res.status, `Strava request failed (${res.status})`);
  return (await res.json()) as T;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Map a Strava SummaryActivity to the compact row the views consume. */
export function mapActivity(raw: Record<string, unknown>): ActivityRow {
  const map = raw.map as Record<string, unknown> | undefined;
  const polyline = str(map?.summary_polyline);
  return {
    id: num(raw.id),
    name: str(raw.name),
    // sport_type supersedes type and carries the new sports (Padel, Dance, …)
    type: str(raw.sport_type) || str(raw.type) || 'Workout',
    startDate: str(raw.start_date),
    startDateLocal: str(raw.start_date_local),
    distance: num(raw.distance),
    movingTime: num(raw.moving_time),
    elapsedTime: num(raw.elapsed_time),
    elevation: num(raw.total_elevation_gain),
    avgSpeed: num(raw.average_speed),
    avgHr: typeof raw.average_heartrate === 'number' ? raw.average_heartrate : undefined,
    avgWatts: typeof raw.average_watts === 'number' ? raw.average_watts : undefined,
    kudosCount: num(raw.kudos_count),
    prCount: num(raw.pr_count),
    achievementCount: num(raw.achievement_count),
    polyline: polyline || undefined,
    deviceName: str(raw.device_name) || undefined,
  };
}

/**
 * All activities from the last ~year: pages of 200 until a short page, with
 * a 3-page safety cap (600 activities). `after` is quantized to the hour so
 * the URL stays stable across remounts — the proxy cache is per-URL, and a
 * second-precision timestamp would miss it on every request.
 */
export async function fetchActivities(now = new Date()): Promise<ActivityRow[]> {
  const exactAfter = Math.floor((now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000) / 1000);
  const after = exactAfter - (exactAfter % 3600);
  const rows: ActivityRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await stravaGet<unknown[]>(
      `/athlete/activities?after=${after}&per_page=${PER_PAGE}&page=${page}`,
    );
    if (!Array.isArray(batch)) break;
    for (const item of batch) rows.push(mapActivity(item as Record<string, unknown>));
    if (batch.length < PER_PAGE) break;
  }
  return rows;
}

export async function fetchAthlete(): Promise<AthleteProfile> {
  const raw = await stravaGet<Record<string, unknown>>('/athlete');
  return {
    id: num(raw.id),
    firstName: str(raw.firstname),
    lastName: str(raw.lastname),
    profile: str(raw.profile) || undefined,
    city: str(raw.city) || undefined,
    state: str(raw.state) || undefined,
    country: str(raw.country) || undefined,
  };
}

function mapTotals(raw: unknown): ActivityTotals {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    count: num(r.count),
    distance: num(r.distance),
    movingTime: num(r.moving_time),
    elevation: num(r.elevation_gain),
  };
}

export async function fetchAthleteStats(athleteId: number): Promise<AthleteStats> {
  const raw = await stravaGet<Record<string, unknown>>(`/athletes/${athleteId}/stats`);
  return {
    allRideTotals: mapTotals(raw.all_ride_totals),
    allRunTotals: mapTotals(raw.all_run_totals),
    allSwimTotals: mapTotals(raw.all_swim_totals),
  };
}
