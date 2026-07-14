// @vitest-environment jsdom
/**
 * Component render tests: mount the real plugin with a stubbed __HS_SDK__ and
 * observe what actually reaches the DOM — the auth gate, data views, and
 * view routing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StravaPlugin from './index';
import type { ModuleStyle } from './hs-plugin';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const STYLE: ModuleStyle = {
  fontSize: 14,
  fontFamily: 'sans-serif',
  textColor: '#fff',
  backgroundColor: 'rgba(0,0,0,0.4)',
  borderRadius: 8,
  padding: 8,
  opacity: 1,
  backdropBlur: 0,
};

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}Z`;
}

function rawRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // 2.5h so the "2 hours ago" assertion isn't flakily on the floor boundary
  const twoHoursAgo = new Date(Date.now() - 2.5 * 3600_000);
  return {
    id: 1,
    name: 'Lakefront Loop',
    sport_type: 'Run',
    start_date: twoHoursAgo.toISOString(),
    start_date_local: localIso(twoHoursAgo),
    distance: 12345,
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 42,
    average_speed: 12345 / 3600,
    kudos_count: 7,
    pr_count: 2,
    achievement_count: 2,
    map: { summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
    ...overrides,
  };
}

function stubSdk(overrides: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).__HS_SDK__ = {
    getAuthStatus: async () => ({ connected: true }),
    pluginFetch: async () => jsonResponse([rawRun()]),
    getHostSettings: () => ({ units: 'metric', timezone: 'UTC' }),
    locale: 'en-US',
    ...overrides,
  };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(config: Record<string, unknown>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StravaPlugin config={config} style={STYLE} />);
  });
  // Let the auth check → connected → fetch → render chain settle; each hop
  // is a separate promise resolution followed by a state update.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  delete (window as unknown as Record<string, unknown>).__HS_SDK__;
});

describe('auth gate', () => {
  it('shows the connect prompt while disconnected', async () => {
    stubSdk({ getAuthStatus: async () => ({ connected: false }) });
    const el = await mount({ view: 'stats-tiles' });
    expect(el.textContent).toContain('Connect Strava');
    expect(el.textContent).toContain('Connect your Strava account in the editor');
  });

  it('flips to the connect prompt when a fetch comes back 401', async () => {
    stubSdk({
      pluginFetch: async () =>
        ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response,
    });
    const el = await mount({ view: 'stats-tiles' });
    expect(el.textContent).toContain('Connect Strava');
  });
});

describe('views', () => {
  it('renders stats tiles with fetched activity data', async () => {
    stubSdk();
    const el = await mount({ view: 'stats-tiles', units: 'metric' });
    expect(el.textContent).toContain('This week');
    expect(el.textContent).toContain('This year');
    expect(el.textContent).toContain('12.3 km');
  });

  it('renders recent activities with name, relative time, and pace', async () => {
    stubSdk();
    const el = await mount({ view: 'recent-activities', units: 'metric' });
    expect(el.textContent).toContain('Lakefront Loop');
    expect(el.textContent).toContain('2 hours ago');
    expect(el.textContent).toContain('/km');
  });

  it('applies the activity filter before rendering', async () => {
    stubSdk();
    const el = await mount({ view: 'recent-activities', activityFilter: 'Ride' });
    expect(el.textContent).not.toContain('Lakefront Loop');
    expect(el.textContent).toContain('No activities yet');
  });

  it('renders goal rings with an on-track badge', async () => {
    stubSdk();
    const el = await mount({
      view: 'goal-progress',
      units: 'metric',
      goals: [{ metric: 'distance', period: 'year', target: 1 }],
    });
    expect(el.textContent).toContain('100%');
    expect(el.textContent).toContain('Year');
  });

  it('renders the heatmap grid with the empty overlay when no activities', async () => {
    stubSdk({ pluginFetch: async () => jsonResponse([]) });
    const el = await mount({ view: 'heatmap' });
    // Adaptive grid: at the jsdom fallback size (520x640) the heatmap shows
    // 8 weeks of 7 days, minus any future days in the current week.
    expect(el.querySelectorAll('rect').length).toBeGreaterThan(40);
    expect(el.textContent).toContain('No activities yet');
  });

  it('renders the latest-activity hero with a route map and kudos', async () => {
    stubSdk();
    const el = await mount({ view: 'latest-hero', units: 'metric' });
    expect(el.textContent).toContain('Lakefront Loop');
    expect(el.textContent).toContain('kudos');
    expect(el.textContent).toContain('2 PRs');
    expect(el.querySelector('path[stroke="#FC4C02"]')).not.toBeNull();
  });

  it('hides the map for indoor activities with no polyline', async () => {
    stubSdk({ pluginFetch: async () => jsonResponse([rawRun({ map: {} })]) });
    const el = await mount({ view: 'latest-hero' });
    expect(el.textContent).toContain('Lakefront Loop');
    expect(el.querySelector('path[stroke="#FC4C02"]')).toBeNull();
  });

  it('renders the athlete card from profile + stats', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.endsWith('/athlete')) {
          return jsonResponse({ id: 9, firstname: 'Ada', lastname: 'Lovelace', city: 'Prior Lake' });
        }
        return jsonResponse({
          all_ride_totals: { count: 12, distance: 500000, moving_time: 72000, elevation_gain: 900 },
          all_run_totals: { count: 34, distance: 250000, moving_time: 90000, elevation_gain: 400 },
          all_swim_totals: { count: 5, distance: 10000, moving_time: 18000, elevation_gain: 0 },
        });
      },
    });
    const el = await mount({ view: 'athlete-card', units: 'metric' });
    expect(el.textContent).toContain('Ada Lovelace');
    expect(el.textContent).toContain('Prior Lake');
    expect(el.textContent).toContain('All time');
    expect(el.textContent).toContain('500 km');
    // No profile photo URL → initials fallback circle
    expect(el.textContent).toContain('AL');
  });
});

describe('v2 views', () => {
  it('renders the dashboard: hero, week strip, and delta pane without goals', async () => {
    stubSdk();
    const el = await mount({ view: 'dashboard', units: 'metric' });
    expect(el.textContent).toContain('Lakefront Loop');
    expect(el.textContent).toContain('This week');
    expect(el.textContent).toContain('vs last week');
    expect(el.textContent).toContain('12.3 km');
    // route thumb from the polyline
    expect(el.querySelector('path[stroke="#FC4C02"]')).not.toBeNull();
  });

  it('renders the dashboard goal ring when a goal is configured', async () => {
    stubSdk();
    const el = await mount({
      view: 'dashboard',
      units: 'metric',
      goals: [{ metric: 'distance', period: 'week', target: 100 }],
    });
    expect(el.textContent).toContain('12%'); // 12.345 of 100 km
    expect(el.textContent).not.toContain('vs last week');
  });

  it('renders the route gallery with art cards and skips indoor activities', async () => {
    stubSdk({
      pluginFetch: async () =>
        jsonResponse([rawRun(), rawRun({ id: 2, name: 'Treadmill', map: {} })]),
    });
    const el = await mount({ view: 'route-gallery', units: 'metric' });
    expect(el.textContent).toContain('Recent routes');
    expect(el.textContent).toContain('12.3 km');
    expect(el.textContent).toContain('today');
    expect(el.querySelectorAll('svg path[stroke="#FC4C02"]')).toHaveLength(1);
  });

  it('renders 12 training-volume bars with the current week highlighted', async () => {
    stubSdk();
    const el = await mount({ view: 'training-volume', units: 'metric' });
    expect(el.textContent).toContain('Training volume');
    expect(el.textContent).toContain('km / week');
    expect(el.textContent).toContain('12-week total');
    expect(el.textContent).toContain('4-wk avg');
  });

  it('renders the year poster with hero distance and grid cells', async () => {
    stubSdk();
    const el = await mount({ view: 'year-poster', units: 'metric' });
    expect(el.textContent).toContain('so far');
    expect(el.textContent).toContain('Moving time');
    expect(el.textContent).toContain('Active days');
    expect(el.textContent).toContain('Kudos');
  });

  it('renders records with the run entries', async () => {
    stubSdk();
    const el = await mount({ view: 'records', units: 'metric' });
    expect(el.textContent).toContain('Records');
    expect(el.textContent).toContain('Longest run');
    expect(el.textContent).toContain('Fastest run pace');
    expect(el.textContent).toContain('Most kudos');
    expect(el.textContent).not.toContain('Longest ride'); // fixture has no rides
  });

  it('renders the month calendar with streak footer and today ring', async () => {
    stubSdk();
    const el = await mount({ view: 'month-calendar', units: 'metric' });
    expect(el.textContent).toContain('Active days');
    expect(el.textContent).toContain('Current streak');
    expect(el.textContent).toContain('This month');
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
    expect(el.textContent).toContain(monthName);
  });
});

describe('v3 views', () => {
  it('renders the route map with overlaid paths and the route count', async () => {
    stubSdk({
      pluginFetch: async () =>
        jsonResponse([rawRun(), rawRun({ id: 2, name: 'Treadmill', map: {} })]),
    });
    const el = await mount({ view: 'route-map', units: 'metric' });
    expect(el.textContent).toContain('Everywhere you go');
    expect(el.textContent).toContain('Routes');
    expect(el.querySelectorAll('svg path[stroke="#FC4C02"]')).toHaveLength(1);
  });

  it('renders the Eddington number with progress to the next one', async () => {
    stubSdk();
    const el = await mount({ view: 'eddington', units: 'metric' });
    // One 12.3 km run → E = 1
    expect(el.textContent).toContain('Eddington number');
    expect(el.textContent).toContain('Next up: 2');
  });

  it('renders training times with weekday and time-of-day sections', async () => {
    stubSdk();
    const el = await mount({ view: 'training-times', units: 'metric' });
    expect(el.textContent).toContain('By day of the week');
    expect(el.textContent).toContain('By time of day');
    expect(el.textContent).toContain('Favorite day');
  });

  it('renders segment PRs from the starred-segments endpoint', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.includes('/segments/starred')) {
          return jsonResponse([
            {
              id: 5,
              name: 'Hill Sprint',
              activity_type: 'Run',
              distance: 800,
              average_grade: 6.5,
              climb_category: 0,
              athlete_pr_effort: { pr_elapsed_time: 165, pr_date: '2026-05-01', effort_count: 12 },
            },
          ]);
        }
        return jsonResponse([]);
      },
    });
    const el = await mount({ view: 'segment-prs', units: 'metric' });
    expect(el.textContent).toContain('Hill Sprint');
    expect(el.textContent).toContain('2:45');
    expect(el.textContent).toContain('12 attempts');
  });

  it('renders gear mileage from the athlete profile', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.endsWith('/athlete')) {
          return jsonResponse({
            id: 9,
            firstname: 'Ada',
            lastname: 'Lovelace',
            bikes: [{ id: 'b1', name: 'Road Bike', primary: true, distance: 2_000_000 }],
            shoes: [{ id: 's1', name: 'Trail Shoes', primary: false, distance: 400_000 }],
          });
        }
        return jsonResponse([]);
      },
    });
    const el = await mount({ view: 'gear', units: 'metric' });
    expect(el.textContent).toContain('Road Bike');
    expect(el.textContent).toContain('2,000 km');
    expect(el.textContent).toContain('Trail Shoes');
    expect(el.textContent).toContain('Primary');
  });

  it('enriches the latest-activity hero with detail-only fields', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.includes('/athlete/activities')) return jsonResponse([rawRun()]);
        if (opts.url.includes('/activities/1')) {
          return jsonResponse({
            id: 1,
            calories: 640.2,
            gear: { id: 's1', name: 'Racing Flats' },
            photos: { count: 1, primary: { urls: { '600': 'https://cdn/photo.jpg' } } },
          });
        }
        return jsonResponse([]);
      },
    });
    const el = await mount({ view: 'latest-hero', units: 'metric' });
    expect(el.textContent).toContain('640 kcal');
    expect(el.textContent).toContain('Racing Flats');
    expect(el.querySelector('img[src="https://cdn/photo.jpg"]')).not.toBeNull();
  });

  it('drops commutes everywhere when the toggle is on', async () => {
    stubSdk({
      pluginFetch: async () =>
        jsonResponse([rawRun(), rawRun({ id: 3, name: 'Office Commute', commute: true })]),
    });
    const el = await mount({
      view: 'recent-activities',
      units: 'metric',
      excludeCommutes: true,
    });
    expect(el.textContent).toContain('Lakefront Loop');
    expect(el.textContent).not.toContain('Office Commute');
  });

  it('tags races in the recent list from workout_type', async () => {
    stubSdk({
      pluginFetch: async () =>
        jsonResponse([rawRun({ id: 4, name: 'City 10K', workout_type: 1 })]),
    });
    const el = await mount({ view: 'recent-activities', units: 'metric' });
    expect(el.textContent).toContain('City 10K');
    expect(el.textContent).toContain('Race');
  });
});

describe('wave 2 views', () => {
  it('renders the year comparison with both year legends and the delta', async () => {
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1, 2, 15); // Mar 15 last year
    stubSdk({
      pluginFetch: async () =>
        jsonResponse([
          rawRun(),
          rawRun({
            id: 2,
            name: 'Last Year Long Run',
            distance: 30000,
            start_date: lastYear.toISOString(),
            start_date_local: localIso(lastYear),
          }),
        ]),
    });
    const el = await mount({ view: 'year-compare', units: 'metric' });
    const year = new Date().getFullYear();
    expect(el.textContent).toContain(String(year));
    expect(el.textContent).toContain(String(year - 1));
    expect(el.textContent).toContain('Last year to date');
    expect(el.textContent).toContain('Difference');
    expect(el.querySelectorAll('polyline').length).toBe(2);
  });

  it('renders the fitness trend with fitness/fatigue/form stats', async () => {
    stubSdk();
    const el = await mount({ view: 'fitness', units: 'metric' });
    expect(el.textContent).toContain('Fitness');
    expect(el.textContent).toContain('Fatigue');
    expect(el.textContent).toContain('Form');
    expect(el.querySelectorAll('polyline').length).toBe(2);
  });

  it('renders planned routes from the routes endpoint', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.endsWith('/athlete')) {
          return jsonResponse({ id: 9, firstname: 'Ada', lastname: 'Lovelace' });
        }
        if (opts.url.includes('/routes')) {
          return jsonResponse([
            {
              id_str: 'r1',
              name: 'Gravel Century Plan',
              distance: 160_000,
              elevation_gain: 1_450,
              estimated_moving_time: 23_400,
              map: { summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            },
          ]);
        }
        return jsonResponse([]);
      },
    });
    const el = await mount({ view: 'planned-routes', units: 'metric' });
    expect(el.textContent).toContain('Gravel Century Plan');
    expect(el.textContent).toContain('160 km');
    expect(el.textContent).toContain('est. 6h 30m');
    expect(el.querySelector('svg path[stroke="#FC4C02"]')).not.toBeNull();
  });

  it('renders the photo wall from photo-bearing activities', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.includes('/athlete/activities')) {
          return jsonResponse([rawRun({ total_photo_count: 2 })]);
        }
        if (opts.url.includes('/activities/1')) {
          return jsonResponse({
            id: 1,
            photos: { count: 2, primary: { urls: { '600': 'https://cdn/p1.jpg' } } },
          });
        }
        return jsonResponse([]);
      },
    });
    const el = await mount({ view: 'photos', units: 'metric' });
    expect(el.querySelector('img[src="https://cdn/p1.jpg"]')).not.toBeNull();
  });

  it('shows the empty message when no activities have photos', async () => {
    stubSdk({
      pluginFetch: async () => jsonResponse([rawRun({ total_photo_count: 0 })]),
    });
    const el = await mount({ view: 'photos', units: 'metric' });
    expect(el.textContent).toContain('No activity photos');
  });

  it('renders milestones with progress to the next round number', async () => {
    stubSdk({
      pluginFetch: async (_id: string, opts: { url: string }) => {
        if (opts.url.endsWith('/athlete')) {
          return jsonResponse({ id: 9, firstname: 'Ada', lastname: 'Lovelace' });
        }
        return jsonResponse({
          all_ride_totals: { count: 412, distance: 12_480_000, moving_time: 100, elevation_gain: 1 },
          all_run_totals: { count: 0, distance: 0, moving_time: 0, elevation_gain: 0 },
          all_swim_totals: { count: 0, distance: 0, moving_time: 0, elevation_gain: 0 },
        });
      },
    });
    const el = await mount({ view: 'milestones', units: 'metric' });
    expect(el.textContent).toContain('12,480 km');
    expect(el.textContent).toContain('520 km to 13,000');
    expect(el.textContent).toContain('412 activities');
    expect(el.textContent).not.toContain('Runs'); // zero-count sports hidden
  });
});

describe('header', () => {
  it('shows the view title by default and hides it when disabled', async () => {
    stubSdk();
    const withHeader = await mount({ view: 'recent-activities' });
    expect(withHeader.textContent).toContain('Recent activities');
    act(() => root!.unmount());
    root = null;
    const withoutHeader = await mount({ view: 'recent-activities', showHeader: false });
    expect(withoutHeader.textContent).not.toContain('Recent activities');
  });
});
