import { afterEach, describe, expect, it } from 'vitest';
import {
  fetchActivities,
  mapActivity,
  mapActivityDetail,
  mapRoute,
  mapStarredSegment,
} from './api';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function rawActivity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,
    name: 'Lunch Ride',
    sport_type: 'GravelRide',
    type: 'Ride',
    start_date: '2025-06-05T17:00:00Z',
    start_date_local: '2025-06-05T12:00:00Z',
    distance: 25000.5,
    moving_time: 3600,
    elapsed_time: 3900,
    total_elevation_gain: 210,
    average_speed: 6.945,
    kudos_count: 3,
    pr_count: 1,
    achievement_count: 2,
    map: { summary_polyline: 'abc' },
    device_name: 'Wahoo ELEMNT',
    ...overrides,
  };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

function stubSdk(pluginFetch: (id: string, opts: { url: string }) => Promise<Response>) {
  (globalThis as Record<string, unknown>).window = { __HS_SDK__: { pluginFetch } };
}

describe('mapActivity', () => {
  it('prefers sport_type over the legacy type field', () => {
    expect(mapActivity(rawActivity()).type).toBe('GravelRide');
    expect(mapActivity(rawActivity({ sport_type: undefined })).type).toBe('Ride');
  });
  it('maps the row fields', () => {
    const row = mapActivity(rawActivity());
    expect(row).toMatchObject({
      id: 42,
      name: 'Lunch Ride',
      startDate: '2025-06-05T17:00:00Z',
      startDateLocal: '2025-06-05T12:00:00Z',
      distance: 25000.5,
      movingTime: 3600,
      elevation: 210,
      kudosCount: 3,
      prCount: 1,
      polyline: 'abc',
      deviceName: 'Wahoo ELEMNT',
    });
  });
  it('defaults missing numerics to zero and omits empty polylines', () => {
    const row = mapActivity({ name: 'Treadmill', sport_type: 'Run', map: { summary_polyline: '' } });
    expect(row.distance).toBe(0);
    expect(row.movingTime).toBe(0);
    expect(row.polyline).toBeUndefined();
    expect(row.deviceName).toBeUndefined();
  });
  it('maps the optional performance fields and flags', () => {
    const row = mapActivity(
      rawActivity({
        max_speed: 14.2,
        max_heartrate: 182,
        suffer_score: 96,
        workout_type: 11,
        commute: true,
        trainer: false,
        athlete_count: 3,
        total_photo_count: 2,
      }),
    );
    expect(row.maxSpeed).toBe(14.2);
    expect(row.maxHr).toBe(182);
    expect(row.sufferScore).toBe(96);
    expect(row.isRace).toBe(true);
    expect(row.commute).toBe(true);
    expect(row.trainer).toBe(false);
    expect(row.athleteCount).toBe(3);
    expect(row.photoCount).toBe(2);
  });
  it('treats run workout_type 1 as a race but 2/3 (long run/workout) as not', () => {
    expect(mapActivity(rawActivity({ workout_type: 1 })).isRace).toBe(true);
    expect(mapActivity(rawActivity({ workout_type: 2 })).isRace).toBe(false);
    expect(mapActivity(rawActivity({ workout_type: 3 })).isRace).toBe(false);
    expect(mapActivity(rawActivity({})).isRace).toBe(false);
  });
});

describe('mapStarredSegment', () => {
  it('maps the segment with the athlete PR effort', () => {
    const seg = mapStarredSegment({
      id: 7,
      name: 'Lookout Climb',
      activity_type: 'Ride',
      distance: 7801.2,
      average_grade: 5.9,
      climb_category: 3,
      city: 'Golden',
      athlete_pr_effort: {
        pr_elapsed_time: 1832,
        pr_date: '2026-04-12',
        effort_count: 41,
      },
    });
    expect(seg).toMatchObject({
      id: 7,
      name: 'Lookout Climb',
      distance: 7801.2,
      climbCategory: 3,
      prTime: 1832,
      prDate: '2026-04-12',
      effortCount: 41,
    });
  });
  it('leaves PR fields undefined for a segment never attempted', () => {
    const seg = mapStarredSegment({ id: 8, name: 'New Star', distance: 900 });
    expect(seg.prTime).toBeUndefined();
    expect(seg.prDate).toBeUndefined();
    expect(seg.effortCount).toBeUndefined();
  });
});

describe('mapRoute', () => {
  it('maps a saved route, preferring id_str and the summary polyline', () => {
    const route = mapRoute({
      id: 9007199254740993,
      id_str: '9007199254740993',
      name: 'Gravel Century Plan',
      distance: 160_000,
      elevation_gain: 1_450,
      estimated_moving_time: 23_400,
      map: { summary_polyline: 'abc', polyline: 'full' },
    });
    expect(route).toEqual({
      id: '9007199254740993',
      name: 'Gravel Century Plan',
      distance: 160_000,
      elevationGain: 1_450,
      estimatedTime: 23_400,
      polyline: 'abc',
    });
  });
  it('falls back to the numeric id and full polyline', () => {
    const route = mapRoute({ id: 77, name: 'Loop', map: { polyline: 'full' } });
    expect(route.id).toBe('77');
    expect(route.polyline).toBe('full');
    expect(route.estimatedTime).toBeUndefined();
  });
});

describe('mapActivityDetail', () => {
  it('picks the largest primary photo url and maps calories and gear', () => {
    const detail = mapActivityDetail({
      id: 42,
      calories: 851.4,
      description: 'Windy!',
      gear: { id: 'b1', name: 'Canyon Endurace', distance: 4_211_000 },
      photos: {
        count: 3,
        primary: { urls: { '100': 'https://cdn/small.jpg', '600': 'https://cdn/big.jpg' } },
      },
    });
    expect(detail.calories).toBe(851.4);
    expect(detail.description).toBe('Windy!');
    expect(detail.gearName).toBe('Canyon Endurace');
    expect(detail.photoUrl).toBe('https://cdn/big.jpg');
  });
  it('handles activities with no photos or gear', () => {
    const detail = mapActivityDetail({ id: 43 });
    expect(detail.photoUrl).toBeUndefined();
    expect(detail.gearName).toBeUndefined();
    expect(detail.calories).toBeUndefined();
  });
});

describe('fetchActivities paging', () => {
  it('stops after a short page', async () => {
    const calls: string[] = [];
    stubSdk(async (_id, opts) => {
      calls.push(opts.url);
      return jsonResponse([rawActivity(), rawActivity()]);
    });
    const rows = await fetchActivities(new Date('2025-06-05T12:00:00Z'));
    expect(rows).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('per_page=200');
    expect(calls[0]).toContain('page=1');
    expect(calls[0]).toContain('after=');
  });

  it('pages until a short page arrives', async () => {
    const full = Array.from({ length: 200 }, (_, i) => rawActivity({ id: i }));
    let page = 0;
    stubSdk(async () => {
      page++;
      return jsonResponse(page < 2 ? full : [rawActivity({ id: 999 })]);
    });
    const rows = await fetchActivities(new Date('2025-06-05T12:00:00Z'));
    expect(page).toBe(2);
    expect(rows).toHaveLength(201);
  });

  it('caps at 3 pages even if every page is full', async () => {
    const full = Array.from({ length: 200 }, (_, i) => rawActivity({ id: i }));
    let page = 0;
    stubSdk(async () => {
      page++;
      return jsonResponse(full);
    });
    const rows = await fetchActivities(new Date('2025-06-05T12:00:00Z'));
    expect(page).toBe(3);
    expect(rows).toHaveLength(600);
  });

  it('doubles the page cap for the two-year window', async () => {
    const full = Array.from({ length: 200 }, (_, i) => rawActivity({ id: i }));
    let page = 0;
    stubSdk(async () => {
      page++;
      return jsonResponse(full);
    });
    const rows = await fetchActivities(new Date('2025-06-05T12:00:00Z'), 731);
    expect(page).toBe(6);
    expect(rows).toHaveLength(1200);
  });

  it('builds an identical URL for calls within the same hour so the proxy cache hits', async () => {
    const calls: string[] = [];
    stubSdk(async (_id, opts) => {
      calls.push(opts.url);
      return jsonResponse([rawActivity()]);
    });
    await fetchActivities(new Date('2025-06-05T12:00:07Z'));
    await fetchActivities(new Date('2025-06-05T12:41:52Z'));
    expect(calls[0]).toBe(calls[1]);
  });

  it('throws a status-carrying error on failure', async () => {
    stubSdk(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response);
    await expect(fetchActivities(new Date())).rejects.toMatchObject({ status: 401 });
  });
});
