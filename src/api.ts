/**
 * Strava API access through the host's plugin proxy. The proxy injects the
 * OAuth bearer token (manifest auth block), refreshes it serialized across
 * tabs/displays, retries once on 401, and caches responses per URL — so
 * screen rotation and multiple module instances share requests.
 */

import type {
  ActivityDetail,
  ActivityRow,
  ActivityTotals,
  AthleteProfile,
  AthleteStats,
  GearItem,
  PlannedRoute,
  StarredSegment,
} from './types';

export const PLUGIN_ID = 'strava';

/**
 * Strava is migrating to https://www.api-v3.strava.com (mandatory Jun 1,
 * 2027). Both hosts are pre-allowlisted in the manifest, so the migration is
 * a one-line change here.
 */
export const API_BASE = 'https://www.strava.com/api/v3';

const CACHE_TTL_MS = 600_000;
/** Old activities' details (photo-wall fetches) barely change — cache long. */
const DETAIL_CACHE_TTL_MS = 21_600_000;
export const ACTIVITY_WINDOW_DAYS = 366;
/** year-compare needs all of last year, so it fetches two years back. */
export const LONG_WINDOW_DAYS = 731;
const PER_PAGE = 200;

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

async function stravaGet<T>(path: string, cacheTtlMs = CACHE_TTL_MS): Promise<T> {
  const sdk = typeof window !== 'undefined' ? window.__HS_SDK__ : undefined;
  if (!sdk) throw new Error('Home Screens SDK unavailable');
  const res = await sdk.pluginFetch(PLUGIN_ID, {
    url: `${API_BASE}${path}`,
    cacheTtlMs,
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

function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// workout_type marks races: 1 for runs, 11 for rides. Community-documented
// (the field is returned live but absent from the swagger schema).
const RACE_WORKOUT_TYPES = new Set([1, 11]);

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
    avgHr: optNum(raw.average_heartrate),
    avgWatts: optNum(raw.average_watts),
    maxSpeed: optNum(raw.max_speed),
    maxHr: optNum(raw.max_heartrate),
    sufferScore: optNum(raw.suffer_score),
    isRace: RACE_WORKOUT_TYPES.has(raw.workout_type as number),
    commute: raw.commute === true,
    trainer: raw.trainer === true,
    athleteCount: optNum(raw.athlete_count),
    photoCount: num(raw.total_photo_count),
    kudosCount: num(raw.kudos_count),
    prCount: num(raw.pr_count),
    achievementCount: num(raw.achievement_count),
    polyline: polyline || undefined,
    deviceName: str(raw.device_name) || undefined,
  };
}

/**
 * All activities from the last `windowDays`: pages of 200 until a short page,
 * with a safety cap (600 activities per year of window). `after` is quantized
 * to the hour so the URL stays stable across remounts — the proxy cache is
 * per-URL, and a second-precision timestamp would miss it on every request.
 */
export async function fetchActivities(
  now = new Date(),
  windowDays = ACTIVITY_WINDOW_DAYS,
): Promise<ActivityRow[]> {
  const exactAfter = Math.floor((now.getTime() - windowDays * 86_400_000) / 1000);
  const after = exactAfter - (exactAfter % 3600);
  const maxPages = windowDays > ACTIVITY_WINDOW_DAYS ? 6 : 3;
  const rows: ActivityRow[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await stravaGet<unknown[]>(
      `/athlete/activities?after=${after}&per_page=${PER_PAGE}&page=${page}`,
    );
    if (!Array.isArray(batch)) break;
    for (const item of batch) rows.push(mapActivity(item as Record<string, unknown>));
    if (batch.length < PER_PAGE) break;
  }
  return rows;
}

function mapGearList(raw: unknown): GearItem[] {
  if (!Array.isArray(raw)) return [];
  const items: GearItem[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const r = g as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;
    items.push({ id: str(r.id), name, primary: r.primary === true, distance: num(r.distance) });
  }
  // Most-used first so the top bar is the 100% reference
  return items.sort((a, b) => b.distance - a.distance);
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
    followerCount: optNum(raw.follower_count),
    weight: optNum(raw.weight),
    ftp: optNum(raw.ftp),
    bikes: mapGearList(raw.bikes),
    shoes: mapGearList(raw.shoes),
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
    ytdRideTotals: mapTotals(raw.ytd_ride_totals),
    ytdRunTotals: mapTotals(raw.ytd_run_totals),
    ytdSwimTotals: mapTotals(raw.ytd_swim_totals),
    recentRideTotals: mapTotals(raw.recent_ride_totals),
    recentRunTotals: mapTotals(raw.recent_run_totals),
    recentSwimTotals: mapTotals(raw.recent_swim_totals),
    biggestRideDistance: num(raw.biggest_ride_distance),
    biggestClimbElevation: num(raw.biggest_climb_elevation_gain),
  };
}

/** Map one SummarySegment (with athlete PR info) from /segments/starred. */
export function mapStarredSegment(raw: Record<string, unknown>): StarredSegment {
  const pr = (raw.athlete_pr_effort ?? {}) as Record<string, unknown>;
  const prTime = optNum(pr.pr_elapsed_time) ?? optNum(pr.elapsed_time);
  return {
    id: num(raw.id),
    name: str(raw.name),
    activityType: str(raw.activity_type),
    distance: num(raw.distance),
    averageGrade: num(raw.average_grade),
    climbCategory: num(raw.climb_category),
    city: str(raw.city) || undefined,
    prTime,
    prDate: str(pr.pr_date) || str(pr.start_date) || undefined,
    effortCount: optNum(pr.effort_count),
  };
}

export async function fetchStarredSegments(): Promise<StarredSegment[]> {
  const raw = await stravaGet<unknown[]>('/segments/starred?per_page=100');
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => mapStarredSegment(item as Record<string, unknown>));
}

/** Map the DetailedActivity extras the latest-activity view can show. */
export function mapActivityDetail(raw: Record<string, unknown>): ActivityDetail {
  const photos = raw.photos as Record<string, unknown> | undefined;
  const primary = photos?.primary as Record<string, unknown> | undefined;
  const urls = primary?.urls as Record<string, unknown> | undefined;
  // Size keys vary ("600", "1000", …) — take the largest available image
  let photoUrl: string | undefined;
  if (urls) {
    let best = -1;
    for (const [key, value] of Object.entries(urls)) {
      const size = Number(key);
      if (typeof value === 'string' && value && size > best) {
        best = size;
        photoUrl = value;
      }
    }
  }
  const gear = raw.gear as Record<string, unknown> | undefined;
  return {
    id: num(raw.id),
    calories: optNum(raw.calories),
    description: str(raw.description) || undefined,
    photoUrl,
    gearName: str(gear?.name) || undefined,
    deviceName: str(raw.device_name) || undefined,
  };
}

export async function fetchActivityDetail(
  id: number,
  opts: { longCache?: boolean } = {},
): Promise<ActivityDetail> {
  const raw = await stravaGet<Record<string, unknown>>(
    `/activities/${id}`,
    opts.longCache ? DETAIL_CACHE_TTL_MS : CACHE_TTL_MS,
  );
  return mapActivityDetail(raw);
}

/** Map one route from GET /athletes/{id}/routes. */
export function mapRoute(raw: Record<string, unknown>): PlannedRoute {
  const map = raw.map as Record<string, unknown> | undefined;
  const polyline = str(map?.summary_polyline) || str(map?.polyline);
  return {
    // id_str is the safe form; numeric route ids can exceed 2^53
    id: str(raw.id_str) || String(raw.id ?? ''),
    name: str(raw.name),
    distance: num(raw.distance),
    elevationGain: num(raw.elevation_gain),
    estimatedTime: optNum(raw.estimated_moving_time),
    polyline: polyline || undefined,
  };
}

export async function fetchRoutes(athleteId: number): Promise<PlannedRoute[]> {
  const raw = await stravaGet<unknown[]>(`/athletes/${athleteId}/routes?per_page=50`);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => mapRoute(item as Record<string, unknown>));
}
