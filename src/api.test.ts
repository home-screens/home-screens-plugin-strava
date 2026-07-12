import { afterEach, describe, expect, it } from 'vitest';
import { fetchActivities, mapActivity } from './api';

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
