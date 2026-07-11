/**
 * Audit harness: mounts the REAL plugin component with a deterministic
 * Strava-like dataset so the rendered views can be screenshotted and compared
 * against the design mockup. Not part of the shipped bundle.
 *
 * Build: npm run audit:build → audit-dist/
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import StravaPlugin from '../src/index';
import type { ModuleStyle } from '../src/hs-plugin';

// ─── deterministic pseudo-random ─────────────────────────────────────────────
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

// ─── polyline encoding (Google algorithm) ────────────────────────────────────
function encodeValue(v: number): string {
  let x = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (x >= 0x20) {
    out += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
    x >>= 5;
  }
  out += String.fromCharCode(x + 63);
  return out;
}

function encodePolyline(points: [number, number][]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - lastLat) + encodeValue(iLng - lastLng);
    lastLat = iLat;
    lastLng = iLng;
  }
  return out;
}

// Organic loop around Prior Lake with per-route character
function loopRoute(routeSeed: number, size: number): string {
  const cLat = 44.7133 + (routeSeed % 5) * 0.01;
  const cLng = -93.4227 - (routeSeed % 3) * 0.015;
  const h1 = 2 + (routeSeed % 4); // 2..5 lobes so shapes differ per route
  const h2 = 4 + (routeSeed % 3);
  const p1 = (routeSeed % 7) * 0.9;
  const p2 = (routeSeed % 11) * 0.55;
  const squash = 1 + ((routeSeed % 6) - 2.5) * 0.14;
  const points: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const wobble = 1 + 0.3 * Math.sin(h1 * t + p1) + 0.13 * Math.sin(h2 * t + p2);
    points.push([
      cLat + size * Math.sin(t) * wobble * squash,
      cLng + size * 1.4 * Math.cos(t) * wobble,
    ]);
  }
  return encodePolyline(points);
}

function outAndBackRoute(routeSeed: number, length: number): string {
  const cLat = 44.7133;
  const cLng = -93.4227 + (routeSeed % 4) * 0.01;
  const out: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    out.push([
      cLat + length * t * 0.4 + 0.12 * length * Math.sin(4 * t + routeSeed),
      cLng + length * t * 1.2,
    ]);
  }
  const back = out.slice(0, -1).reverse().map(([la, ln]) => [la + 0.0004, ln] as [number, number]);
  return encodePolyline([...out, ...back]);
}

// ─── dataset ─────────────────────────────────────────────────────────────────
const now = new Date();
const KM = 1000;

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}Z`;
}

function daysAgo(days: number, hour = 7): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, 12, 0);
}

let nextId = 1;
function activity(opts: {
  date: Date;
  type: string;
  name: string;
  km: number;
  speedKmh: number;
  climb?: number;
  kudos?: number;
  prs?: number;
  route?: string | null;
  device?: string;
}): Record<string, unknown> {
  const id = nextId++;
  const distance = opts.km * KM;
  const movingTime = Math.round(distance / (opts.speedKmh / 3.6));
  return {
    id,
    name: opts.name,
    sport_type: opts.type,
    start_date: new Date(opts.date.getTime()).toISOString(),
    start_date_local: localIso(opts.date),
    distance,
    moving_time: movingTime,
    elapsed_time: movingTime + 300,
    total_elevation_gain: opts.climb ?? Math.round(opts.km * 6),
    average_speed: distance / movingTime,
    kudos_count: opts.kudos ?? Math.floor(rand() * 12),
    pr_count: opts.prs ?? 0,
    achievement_count: opts.prs ?? 0,
    map: {
      summary_polyline:
        opts.route === null
          ? ''
          : (opts.route ??
            (opts.type.includes('Run') && rand() < 0.4
              ? outAndBackRoute(id, 0.02 + opts.km * 0.0008)
              : loopRoute(id, 0.008 + opts.km * 0.00045))),
    },
    device_name: opts.device,
  };
}

const RIDE_NAMES = ['Morning spin', 'Lunch loop', 'Gravel wander', 'After-work ride', 'Lake circuit'];
const RUN_NAMES = ['Easy run', 'Tempo tuesday', 'Neighborhood miles', 'Trail shakeout', 'Long run'];

const activities: Record<string, unknown>[] = [];

// Today's hero ride (matches mockup): 42.3 km gravel, 2.5h ago, 2 PRs, 7 kudos
activities.push(
  activity({
    date: new Date(now.getTime() - 2.5 * 3600_000),
    type: 'GravelRide',
    name: 'Gravel loop past Spring Lake',
    km: 42.3,
    speedKmh: 22.6,
    climb: 312,
    kudos: 7,
    prs: 2,
    device: 'Wahoo ELEMNT',
  }),
);

// Rest of the current ISO week (Mon run, Tue ride, Thu ride, Fri run)
const dow = (now.getDay() + 6) % 7; // Mon=0
const weekPlan: [number, string, string, number, number][] = [
  [dow - 0 === 0 ? -1 : dow, 'Run', 'Monday shakeout', 8.4, 11.4], // Monday
  [dow - 1, 'Ride', 'Tuesday intervals', 36.2, 27.1],
  [dow - 3, 'Ride', 'Thursday endurance', 41.8, 24.9],
  [dow - 4, 'Run', 'Friday easy 6k', 6.4, 10.8],
];
for (const [back, type, name, km, speed] of weekPlan) {
  if (back > 0 && back <= dow) {
    activities.push(activity({ date: daysAgo(back), type, name, km, speedKmh: speed }));
  }
}

// Records standouts (within the last 12 months)
activities.push(
  activity({
    date: daysAgo(84, 9),
    type: 'GravelRide',
    name: 'Waconia century attempt',
    km: 128.4,
    speedKmh: 24.2,
    climb: 640,
    kudos: 38,
    prs: 3,
  }),
  activity({
    date: daysAgo(34, 8),
    type: 'Run',
    name: 'Half marathon prep',
    km: 21.3,
    speedKmh: 11.6,
  }),
  activity({
    date: daysAgo(49, 10),
    type: 'MountainBikeRide',
    name: 'North Shore trip',
    km: 38.2,
    speedKmh: 16.4,
    climb: 987,
  }),
  activity({
    date: daysAgo(21, 8),
    type: 'Run',
    name: 'Parkrun PB',
    km: 8.0,
    speedKmh: 13.2,
    prs: 1,
  }),
);

// Procedural history: ~3-4 activities/week over the past year
for (let week = 1; week < 52; week++) {
  const perWeek = 2 + Math.floor(rand() * 3);
  for (let a = 0; a < perWeek; a++) {
    const back = week * 7 + Math.floor(rand() * 6) - 5;
    if (back <= dow) continue;
    const isRide = rand() < 0.6;
    activities.push(
      activity({
        date: daysAgo(back, 6 + Math.floor(rand() * 12)),
        type: isRide ? (rand() < 0.3 ? 'GravelRide' : 'Ride') : rand() < 0.25 ? 'TrailRun' : 'Run',
        name: isRide
          ? RIDE_NAMES[Math.floor(rand() * RIDE_NAMES.length)]
          : RUN_NAMES[Math.floor(rand() * RUN_NAMES.length)],
        km: isRide ? 18 + rand() * 40 : 5 + rand() * 12,
        speedKmh: isRide ? 21 + rand() * 7 : 10 + rand() * 3,
        route: rand() < 0.12 ? null : undefined, // some indoor
      }),
    );
  }
}

// ─── SDK stub ────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

(window as unknown as Record<string, unknown>).__HS_SDK__ = {
  getAuthStatus: async () => ({ connected: true }),
  pluginFetch: async (_id: string, opts: { url: string }) => {
    if (opts.url.includes('/athlete/activities')) {
      const page = Number(new URL(opts.url).searchParams.get('page') ?? '1');
      return jsonResponse(page === 1 ? activities : []);
    }
    if (opts.url.endsWith('/athlete')) {
      return jsonResponse({ id: 7, firstname: 'Bryan', lastname: 'Athlete', city: 'Prior Lake', state: 'Minnesota' });
    }
    return jsonResponse({
      all_ride_totals: { count: 214, distance: 6_400_000, moving_time: 920_000, elevation_gain: 31_000 },
      all_run_totals: { count: 180, distance: 1_600_000, moving_time: 560_000, elevation_gain: 8_000 },
      all_swim_totals: { count: 12, distance: 18_000, moving_time: 25_000, elevation_gain: 0 },
    });
  },
  getHostSettings: () => ({ units: 'metric', timezone: 'America/Chicago' }),
  locale: 'en-US',
};

// ─── page ────────────────────────────────────────────────────────────────────
const STYLE: ModuleStyle = {
  fontSize: 14,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  textColor: '#ffffff',
  backgroundColor: 'rgba(10, 12, 16, 0.62)',
  borderRadius: 16,
  padding: 20,
  opacity: 1,
  backdropBlur: 0,
};

function Frame({
  caption,
  w,
  h,
  config,
}: {
  caption: string;
  w: number;
  h: number;
  config: Record<string, unknown>;
}) {
  return (
    <div style={{ width: w }}>
      <div className="caption" dangerouslySetInnerHTML={{ __html: caption }} />
      <div className="frame" style={{ width: w, height: h }}>
        <StravaPlugin config={config} style={STYLE} />
      </div>
    </div>
  );
}

function AuditPage() {
  return (
    <>
      <Frame
        caption="<b>V1 · dashboard</b> — 1040 × 460 · with a 150 km week goal"
        w={1040}
        h={460}
        config={{ view: 'dashboard', goals: [{ metric: 'distance', period: 'week', target: 150 }] }}
      />
      <Frame
        caption="<b>V1b · dashboard</b> — no goal configured → vs-last-week deltas"
        w={1040}
        h={460}
        config={{ view: 'dashboard' }}
      />
      <Frame
        caption="<b>V2 · route gallery</b> — 1040 × 620"
        w={1040}
        h={620}
        config={{ view: 'route-gallery' }}
      />
      <div className="row">
        <Frame
          caption="<b>V3 · training volume</b> — 510 × 420"
          w={510}
          h={420}
          config={{ view: 'training-volume' }}
        />
        <Frame
          caption="<b>V4 · year so far</b> — 510 × 420"
          w={510}
          h={420}
          config={{ view: 'year-poster' }}
        />
      </div>
      <div className="row">
        <Frame
          caption="<b>V5 · records</b> — 510 × 470"
          w={510}
          h={470}
          config={{ view: 'records' }}
        />
        <Frame
          caption="<b>V6 · month</b> — 510 × 470"
          w={510}
          h={470}
          config={{ view: 'month-calendar' }}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<AuditPage />);
