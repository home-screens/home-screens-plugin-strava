/** Layout regression check for the display views: renders each view at a
 *  matrix of real module sizes in Chromium, then measures vertical dead
 *  space and overflow inside every module box.
 *
 *  Run: npm run test:layout          (screenshots land in scripts/.shots/)
 *  Fails when content overflows the box or dead space exceeds the budget.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

import type {
  ActivityDetail,
  ActivityRow,
  AthleteProfile,
  AthleteStats,
  PhotoItem,
  PlannedRoute,
  StarredSegment,
  StravaConfig,
} from '../src/types';
import { filterActivities, sortNewestFirst } from '../src/aggregate';
import { parseLocalIso } from '../src/date-ranges';
import { relativeTime } from '../src/format';
import { t } from '../src/i18n';
import { Header, headerLabel } from '../src/index';
import { tierFor } from '../src/size';
import {
  AthleteCardView,
  GoalProgressView,
  HeatmapView,
  LatestHeroView,
  RecentActivitiesView,
  StatsTilesView,
  type ViewProps,
} from '../src/views';
import { DashboardView } from '../src/views-dashboard';
import {
  PhotoWallView,
  PlannedRoutesView,
  RouteGalleryView,
  RouteMapView,
} from '../src/views-gallery';
import {
  EddingtonView,
  MonthCalendarView,
  RecordsView,
  TrainingTimesView,
  TrainingVolumeView,
  volumeUnit,
  YearPosterView,
} from '../src/views-insights';
import { GearView, MilestonesView, SegmentPrsView } from '../src/views-athlete';
import { FitnessView, YearCompareView } from '../src/views-trends';

// ─── Fixtures ───────────────────────────────────────────────────────
// A year of activities in the shape the API mapper produces. Everything is
// deterministic (no Math.random) so failures reproduce exactly.

const DAY = 86_400_000;
const NOW = new Date();

/** Google encoded-polyline encoder (the inverse of src/polyline.ts). */
function encodePolyline(points: [number, number][]): string {
  const enc = (v: number): string => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  let lat = 0;
  let lng = 0;
  let out = '';
  for (const [la, ln] of points) {
    const ila = Math.round(la * 1e5);
    const iln = Math.round(ln * 1e5);
    out += enc(ila - lat) + enc(iln - lng);
    lat = ila;
    lng = iln;
  }
  return out;
}

/** Parametric route shapes so the gallery shows varied line art. */
function makeRoute(seed: number): string {
  const n = 60;
  const points: [number, number][] = [];
  const kind = seed % 3;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * 2 * Math.PI;
    let x: number;
    let y: number;
    if (kind === 0) {
      // wobbly loop
      const r = 1 + 0.25 * Math.sin(3 * th + seed) + 0.12 * Math.sin(7 * th);
      x = r * Math.cos(th);
      y = r * Math.sin(th) * 0.7;
    } else if (kind === 1) {
      // figure eight
      x = Math.sin(th);
      y = Math.sin(2 * th) * 0.55;
    } else {
      // out-and-back with jitter
      const f = i <= n / 2 ? i / (n / 2) : 2 - i / (n / 2);
      x = f * 2 - 1;
      y = 0.35 * Math.sin(5 * f * Math.PI + seed) * f;
    }
    points.push([39.7 + y * 0.02, -105.1 + x * 0.03]);
  }
  return encodePolyline(points);
}

interface SportSpec {
  type: string;
  name: string;
  distance: number;
  movingTime: number;
  avgHr?: number;
  elevation: number;
  routed: boolean;
}

const SPORTS: SportSpec[] = [
  { type: 'Run', name: 'Morning Run', distance: 8_050, movingTime: 2_640, avgHr: 152, elevation: 84, routed: true },
  { type: 'Ride', name: 'Gravel Ride', distance: 42_300, movingTime: 6_480, avgHr: 138, elevation: 620, routed: true },
  { type: 'TrailRun', name: 'Trail Loop', distance: 12_400, movingTime: 4_980, avgHr: 148, elevation: 410, routed: true },
  { type: 'WeightTraining', name: 'Strength', distance: 0, movingTime: 2_700, avgHr: 118, elevation: 0, routed: false },
  { type: 'Walk', name: 'Evening Walk', distance: 3_900, movingTime: 2_760, avgHr: 96, elevation: 25, routed: true },
  { type: 'VirtualRide', name: 'Zwift Intervals', distance: 30_100, movingTime: 3_600, avgHr: 145, elevation: 240, routed: false },
  { type: 'Swim', name: 'Pool Swim', distance: 1_500, movingTime: 1_920, avgHr: 128, elevation: 0, routed: false },
  { type: 'Hike', name: 'Ridge Hike', distance: 9_800, movingTime: 10_200, avgHr: 121, elevation: 540, routed: true },
];

function isoPair(daysBack: number, hour: number): { startDate: string; startDateLocal: string } {
  const d = new Date(NOW.getTime() - daysBack * DAY);
  const local = `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:30:00Z`;
  return { startDate: local, startDateLocal: local };
}

function makeActivity(id: number, daysBack: number, spec: SportSpec, scale = 1): ActivityRow {
  const distance = Math.round(spec.distance * scale);
  const movingTime = Math.round(spec.movingTime * scale);
  return {
    id,
    name: spec.name,
    type: spec.type,
    ...isoPair(daysBack, 6 + (id % 3) * 6),
    distance,
    movingTime,
    elapsedTime: movingTime + 120,
    elevation: Math.round(spec.elevation * scale),
    avgSpeed: movingTime > 0 ? distance / movingTime : 0,
    avgHr: spec.avgHr,
    maxSpeed: movingTime > 0 ? (distance / movingTime) * 1.6 : undefined,
    isRace: id % 17 === 0,
    commute: id % 11 === 0,
    trainer: spec.type === 'VirtualRide',
    photoCount: id % 5 === 0 ? 1 + (id % 3) : 0,
    kudosCount: (id * 7) % 23,
    prCount: id % 9 === 0 ? 1 + (id % 3) : 0,
    achievementCount: id % 4,
    polyline: spec.routed ? makeRoute(id) : undefined,
    deviceName: spec.type.includes('Ride') ? 'Wahoo ELEMNT ROAM' : 'Garmin Forerunner 265',
  };
}

const rows: ActivityRow[] = [];
let nextId = 100;
// Dense recent 8 weeks (every other day), sparser through the rest of the year
for (let back = 0; back < 56; back += 2) {
  const spec = SPORTS[(back / 2) % SPORTS.length];
  rows.push(makeActivity(nextId++, back, spec, 0.8 + ((back % 5) * 0.12)));
}
for (let back = 57; back < 364; back += 3) {
  const spec = SPORTS[back % SPORTS.length];
  rows.push(makeActivity(nextId++, back, spec, 0.7 + ((back % 7) * 0.1)));
}
// Records fodder: standout efforts the records view should surface
rows.push({
  ...makeActivity(nextId++, 201, SPORTS[1], 1),
  name: 'Century Attempt', distance: 121_400, movingTime: 17_820, avgSpeed: 121_400 / 17_820,
  elevation: 1_856, kudosCount: 87, prCount: 3,
});
rows.push({
  ...makeActivity(nextId++, 130, SPORTS[0], 1),
  name: 'Long Run — Marathon Build', distance: 30_500, movingTime: 10_320, avgSpeed: 30_500 / 10_320,
  elevation: 260, kudosCount: 44,
});
rows.push({
  ...makeActivity(nextId++, 88, SPORTS[0], 1),
  name: 'Parkrun PR', distance: 5_000, movingTime: 1_180, avgSpeed: 5_000 / 1_180,
  elevation: 12, kudosCount: 31, prCount: 2,
});

const ATHLETE: AthleteProfile = {
  id: 42,
  firstName: 'Bryan',
  lastName: 'Brazil',
  profile: 'https://dgalywyr863hv.cloudfront.net/pictures/avatar/athlete/large.png',
  city: 'Kansas City',
  state: 'Missouri',
  country: 'United States',
  followerCount: 184,
  weight: 78,
  ftp: 245,
  bikes: [
    { id: 'b1', name: 'Canyon Endurace CF SL', primary: true, distance: 8_412_000 },
    { id: 'b2', name: 'Santa Cruz Tallboy', primary: false, distance: 2_106_000 },
    { id: 'b3', name: 'Surly Cross-Check (commuter)', primary: false, distance: 1_030_000 },
  ],
  shoes: [
    { id: 's1', name: 'Saucony Endorphin Speed 4', primary: true, distance: 612_000 },
    { id: 's2', name: 'Hoka Speedgoat 5', primary: false, distance: 305_000 },
  ],
};
const ATHLETE_STATS: AthleteStats = {
  allRideTotals: { count: 412, distance: 12_480_000, movingTime: 1_684_800, elevation: 96_400 },
  allRunTotals: { count: 655, distance: 5_940_000, movingTime: 1_527_600, elevation: 41_200 },
  allSwimTotals: { count: 38, distance: 61_500, movingTime: 90_000, elevation: 0 },
  ytdRideTotals: { count: 64, distance: 1_890_000, movingTime: 260_100, elevation: 15_800 },
  ytdRunTotals: { count: 88, distance: 812_000, movingTime: 216_000, elevation: 6_400 },
  ytdSwimTotals: { count: 6, distance: 9_500, movingTime: 13_500, elevation: 0 },
  recentRideTotals: { count: 9, distance: 262_000, movingTime: 37_800, elevation: 2_400 },
  recentRunTotals: { count: 12, distance: 118_000, movingTime: 31_500, elevation: 900 },
  recentSwimTotals: { count: 1, distance: 1_500, movingTime: 2_100, elevation: 0 },
  biggestRideDistance: 164_300,
  biggestClimbElevation: 1_412,
};
const SEGMENTS: StarredSegment[] = [
  { id: 1, name: 'Lookout Mountain Climb', activityType: 'Ride', distance: 7_540, averageGrade: 5.4, climbCategory: 3, city: 'Golden', prTime: 1_832, prDate: '2026-04-12', effortCount: 41 },
  { id: 2, name: 'River Path Sprint', activityType: 'Ride', distance: 1_120, averageGrade: 0.4, climbCategory: 0, city: 'Kansas City', prTime: 132, prDate: '2026-06-02', effortCount: 118 },
  { id: 3, name: 'Cemetery Hill Repeats', activityType: 'Run', distance: 640, averageGrade: 8.1, climbCategory: 0, prTime: 174, prDate: '2026-01-19', effortCount: 26 },
  { id: 4, name: 'Big Cottonwood Canyon Full', activityType: 'Ride', distance: 23_900, averageGrade: 6.2, climbCategory: 5, city: 'Salt Lake City', prTime: 5_610, prDate: '2025-09-07', effortCount: 3 },
  { id: 5, name: 'Park Loop Counterclockwise', activityType: 'Run', distance: 3_150, averageGrade: 0.9, climbCategory: 0, prTime: 812, prDate: '2026-05-30', effortCount: 63 },
  { id: 6, name: 'Windy Ridge Traverse', activityType: 'Ride', distance: 11_300, averageGrade: 2.7, climbCategory: 1 },
];
// A 1×1 transparent PNG keeps layout boxes real without a network fetch
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';
const LATEST_DETAIL_BASE: Omit<ActivityDetail, 'id'> = {
  calories: 842,
  gearName: 'Canyon Endurace CF SL',
  photoUrl: TRANSPARENT_PNG,
};
const PLANNED_ROUTES: PlannedRoute[] = Array.from({ length: 8 }, (_, i) => ({
  id: `route-${i}`,
  name: ['Gravel Century Plan', 'Hilly Fondo', 'Coffee Loop', 'River Out-and-Back', 'Climbing Day', 'Recovery Spin', 'Long Trail Mix', 'Night Loop'][i],
  distance: 24_000 + i * 17_500,
  elevationGain: 180 + i * 210,
  estimatedTime: 3_400 + i * 2_500,
  polyline: makeRoute(i * 7 + 2),
}));
const PHOTOS: PhotoItem[] = Array.from({ length: 10 }, (_, i) => ({
  activityId: 9_000 + i,
  url: TRANSPARENT_PNG,
  name: `Ride photo ${i + 1}`,
  startDateLocal: isoPair(i * 4, 9).startDateLocal,
}));

const BASE_CONFIG: StravaConfig = {
  view: 'stats-tiles',
  activityFilter: 'all',
  excludeCommutes: false,
  recentLimit: 5,
  goals: [],
  units: 'imperial',
  heatmapMetric: 'count',
  volumeMetric: 'distance',
  showMap: true,
  showHeader: true,
};


// ─── Marketing shots ────────────────────────────────────────────────
// Website carousel captures: a curated set of views at one wide size,
// screenshotted at 2x. Everything above this section is sliced verbatim
// from layout-check.tsx.
//
// The whole fixture timeline is shifted so "now" lands on the Saturday at
// the end of a full training week — a calendar week that starts today would
// render empty bars and a BEHIND goal ring. Computed from today's weekday so
// the shots stay camera-ready no matter when they're captured.

const W = 640;
const H = 420;
const MPAD = 16;

// "Now" is pinned to 20:30 on the most recent Saturday — the one already
// behind us, never the one ahead. An upcoming Saturday can fall in next
// month, which leaves the month calendar showing a nearly empty grid and a
// "1 ACTIVE DAYS" footer for the last week of every month.
//
// Landing in the first few days of a month has the same problem in
// miniature, so a Saturday that early steps back another week into the
// month that does have a full set of activities.
//
// The hour is after the day's last fixture activity (18:30) in every
// timezone, so "latest activity" never reads as being in the future.
const MNOW = new Date(NOW);
MNOW.setDate(MNOW.getDate() - ((MNOW.getDay() + 1) % 7));
if (MNOW.getDate() < 8) MNOW.setDate(MNOW.getDate() - 7);
MNOW.setHours(20, 30, 0, 0);
const pad2 = (n: number): string => String(n).padStart(2, '0');
const targetDate = `${MNOW.getFullYear()}-${pad2(MNOW.getMonth() + 1)}-${pad2(MNOW.getDate())}`;
// A whole number of days, moving the fixture's day-0 date onto MNOW's date.
// The fixture's ISO dates come from NOW's UTC date, which in the evening is
// already tomorrow locally — so the source end is the UTC date too, or every
// activity lands a day off and the calendar's "today" cell renders empty.
const SHIFT =
  Date.parse(`${targetDate}T00:00:00Z`) -
  Date.parse(`${NOW.toISOString().slice(0, 10)}T00:00:00Z`);
const shiftIso = (s: string): string =>
  new Date(Date.parse(s) + SHIFT).toISOString().replace('.000Z', 'Z');

// ── Street-grid routes ──────────────────────────────────────────────
// The layout-check routes are parametric shapes — fine for measuring boxes,
// a spirograph when 86 of them overlay on the route map. Real GPS tracks
// follow roads: straight blocks, right-angle turns, and the same few exit
// streets out of the neighborhood retraced ride after ride. So routes here
// are walks on a virtual street grid. Intersections get a deterministic
// hash-based bend (roads aren't laser-straight), and because the bend is a
// function of the intersection alone, every route that uses a road traces
// the exact same polyline — corridors overlap the way they do in real life.

const KM_PER_DEG_LAT = 110.6;
const KM_PER_DEG_LNG = 78.8; // at ~44.7°N
const HOME: [number, number] = [44.752, -93.452];
const CELL_KM = 0.35;
const CLA = CELL_KM / KM_PER_DEG_LAT;
const CLN = CELL_KM / KM_PER_DEG_LNG;

function seededRand(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashNoise(x: number, y: number, k: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

function gridPoint(gx: number, gy: number): [number, number] {
  return [
    HOME[0] + gy * CLA + hashNoise(gx, gy, 1) * CLA * 0.3,
    HOME[1] + gx * CLN + hashNoise(gx, gy, 2) * CLN * 0.3,
  ];
}

/** Emit every intersection along a list of [dx, dy] legs (one axis each). */
function walkLegs(legs: [number, number][]): [number, number][] {
  let gx = 0;
  let gy = 0;
  const pts: [number, number][] = [gridPoint(gx, gy)];
  for (const [dx, dy] of legs) {
    const steps = Math.abs(dx || dy);
    const ux = Math.sign(dx);
    const uy = Math.sign(dy);
    for (let i = 0; i < steps; i++) {
      gx += ux;
      gy += uy;
      pts.push(gridPoint(gx, gy));
    }
  }
  return pts;
}

/** Closed staircase loop: out in 3–4 alternating legs, home in 2. */
function loopLegs(rnd: () => number, blocks: number): [number, number][] {
  const half = Math.max(4, Math.round(blocks / 2));
  const sx = rnd() < 0.5 ? 1 : -1;
  const sy = rnd() < 0.5 ? 1 : -1;
  const xTotal = Math.max(2, Math.round(half * (0.35 + rnd() * 0.3)));
  const yTotal = Math.max(2, half - xTotal);
  const x1 = Math.max(1, Math.round(xTotal * (0.3 + rnd() * 0.5)));
  const y1 = Math.max(1, Math.round(yTotal * (0.3 + rnd() * 0.5)));
  return (
    [
      [sx * x1, 0],
      [0, sy * y1],
      [sx * (xTotal - x1), 0],
      [0, sy * (yTotal - y1)],
      [-sx * xTotal, 0],
      [0, -sy * yTotal],
    ] as [number, number][]
  ).filter(([a, b]) => a !== 0 || b !== 0);
}

/** Straight out with one dogleg, exact same roads home. */
function outBackLegs(rnd: () => number, blocks: number): [number, number][] {
  const out = Math.max(3, Math.round(blocks / 2));
  const d1 = Math.max(1, Math.round(out * (0.4 + rnd() * 0.3)));
  const jog = 1 + Math.floor(rnd() * 2);
  const sx = rnd() < 0.5 ? 1 : -1;
  const sy = rnd() < 0.5 ? 1 : -1;
  const axisX = rnd() < 0.5;
  const legs: [number, number][] = axisX
    ? [[sx * d1, 0], [0, sy * jog], [sx * (out - d1), 0]]
    : [[0, sy * d1], [sx * jog, 0], [0, sy * (out - d1)]];
  const back = legs.map(([a, b]) => [-a, -b] as [number, number]).reverse();
  return [...legs, ...back];
}

/** Winding out-and-back trail from a remote anchor (trails aren't grids). */
function trailRoute(seed: number, anchor: [number, number], distanceMeters: number): string {
  const rnd = seededRand(seed);
  const n = 45;
  const stepKm = distanceMeters / 2 / 1000 / n;
  let heading = rnd() * Math.PI * 2;
  const pts: [number, number][] = [anchor];
  for (let i = 1; i < n; i++) {
    heading += (rnd() - 0.5) * 0.5 + Math.sin(i / 6) * 0.12;
    const [la, ln] = pts[i - 1];
    pts.push([
      la + (Math.sin(heading) * stepKm) / KM_PER_DEG_LAT,
      ln + (Math.cos(heading) * stepKm) / KM_PER_DEG_LNG,
    ]);
  }
  return encodePolyline([...pts, ...pts.slice(0, -1).reverse()]);
}

// The same three exit streets serve every route from home — that repetition
// is what builds the bright corridors a real map has.
const CORRIDORS: [number, number][][] = [
  [[3, 0]],
  [[0, 2], [1, 0]],
  [[-2, 0], [0, -2]],
];

const TRAILHEADS: [number, number][] = [
  [44.807, -93.514],
  [44.701, -93.372],
];

function gridRoute(seed: number, distanceMeters: number, forceLoop = false): string {
  const rnd = seededRand(seed);
  const corridor = CORRIDORS[Math.floor(rnd() * CORRIDORS.length)];
  const corridorBlocks = corridor.reduce((s, [a, b]) => s + Math.abs(a || b), 0);
  const blocks = Math.max(6, Math.round(distanceMeters / 1000 / CELL_KM) - corridorBlocks * 2);
  const body = forceLoop || rnd() < 0.7 ? loopLegs(rnd, blocks) : outBackLegs(rnd, blocks);
  const back = corridor.map(([a, b]) => [-a, -b] as [number, number]).reverse();
  return encodePolyline(walkLegs([...corridor, ...body, ...back]));
}

function routeFor(r: ActivityRow): string | undefined {
  if (!r.polyline) return undefined;
  if (r.type === 'TrailRun') return trailRoute(r.id, TRAILHEADS[0], r.distance);
  if (r.type === 'Hike') return trailRoute(r.id, TRAILHEADS[1], r.distance);
  return gridRoute(r.id, r.distance);
}

// Marketing-only prior-year rows: the shared fixture spans 364 days, which
// leaves the year-compare view's "last year" line at zero. Extend the
// timeline a second year back so the comparison actually compares.
const priorYearRows: ActivityRow[] = [];
for (let back = 365; back < 720; back += 3) {
  const spec = SPORTS[back % SPORTS.length];
  priorYearRows.push(makeActivity(5_000 + back, back, spec, 0.55 + ((back % 6) * 0.08)));
}

// `startDateLocal` is a wall clock the views read component-by-component, so
// the shift keeps its digits. `startDate` is a real instant compared against
// MNOW, so it has to be that same wall clock converted out of the local zone
// — carrying the fixture's Z through would put the evening activity hours
// ahead of MNOW anywhere east of about UTC+2, and "3 hours ago" would render
// as a time in the future.
const shotRows = sortNewestFirst(filterActivities([...rows, ...priorYearRows], 'all')).map((r) => {
  const startDateLocal = shiftIso(r.startDateLocal);
  return {
    ...r,
    startDate: parseLocalIso(startDateLocal).toISOString(),
    startDateLocal,
    polyline: routeFor(r),
  };
});
// The dashboard hero thumbnail is the newest activity — force a tidy WIDE
// loop. The hero map matches the route's aspect, so a portrait-shaped route
// makes the panel tall enough to push the week strip out of the box.
shotRows[0] = {
  ...shotRows[0],
  polyline: encodePolyline(
    walkLegs([[3, 0], [0, 2], [5, 0], [0, -3], [-5, 0], [0, 1], [-3, 0]]),
  ),
};

// ── Camera-ready imagery ────────────────────────────────────────────
// The layout harness uses a transparent PNG (and hides <img> outright)
// because it only measures boxes. Marketing shots need the photo wall and
// hero to look like photos, so these are scenic SVG data URIs: gradient
// sky, sun, and two mountain ridges, deterministic per seed.

function scenicPhoto(seed: number): string {
  const palettes = [
    ['#1e3a8a', '#7dd3fc', '#0f172a', '#1e293b'], // alpine dawn
    ['#7c2d12', '#fdba74', '#1c0a04', '#431407'], // desert sunset
    ['#14532d', '#86efac', '#052012', '#14532d'], // forest morning
    ['#312e81', '#d8b4fe', '#140e2e', '#2e1065'], // dusk ride
    ['#0c4a6e', '#a5f3fc', '#082033', '#164e63'], // lake start
  ];
  const [top, glow, farRidge, nearRidge] = palettes[seed % palettes.length];
  const r = seededRand(seed * 13 + 7);
  const ridge = (base: number, amp: number): string =>
    Array.from({ length: 6 }, (_, i) => `${i * 20},${base - Math.round(r() * amp)}`).join(' ');
  const sunX = 18 + Math.round(r() * 64);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${glow}"/>` +
    `</linearGradient></defs>` +
    `<rect width="100" height="70" fill="url(#s)"/>` +
    `<circle cx="${sunX}" cy="${14 + Math.round(r() * 10)}" r="6.5" fill="#fff7ed" opacity="0.9"/>` +
    `<polygon points="0,70 ${ridge(46, 18)} 100,70" fill="${farRidge}" opacity="0.75"/>` +
    `<polygon points="0,70 ${ridge(58, 14)} 100,70" fill="${nearRidge}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#dc2626"/>` +
      `</linearGradient></defs>` +
      `<rect width="64" height="64" fill="url(#g)"/>` +
      `<text x="32" y="41" text-anchor="middle" font-family="-apple-system,'Segoe UI',sans-serif" ` +
      `font-size="24" font-weight="700" fill="#fff">BB</text></svg>`,
  );

const ATHLETE_M: AthleteProfile = { ...ATHLETE, profile: AVATAR };
const PHOTO_NAMES = [
  'Sunrise over the ridge', 'Gravel miles', 'Summit break', 'River path',
  'Golden hour spin', 'Trailhead', 'Post-race', 'Canyon overlook',
  'Group ride', 'Cooldown lap',
];
const PHOTOS_M: PhotoItem[] = PHOTOS.map((p, i) => ({
  ...p,
  url: scenicPhoto(i),
  name: PHOTO_NAMES[i % PHOTO_NAMES.length],
  startDateLocal: shiftIso(p.startDateLocal),
}));

interface ShotCase {
  name: string;
  view: StravaConfig['view'];
  component: React.ComponentType<ViewProps>;
  config?: Partial<StravaConfig>;
  /** Attach the detailed-activity extras (latest-hero enrichment) */
  withDetail?: boolean;
  /** Override the default shot box (views that need a taller/wider stage) */
  w?: number;
  h?: number;
}
const SHOTS: ShotCase[] = [
  // The dashboard's hero + THIS WEEK strip needs the 976×660 validated size;
  // at 640×420 the week strip clips off the bottom of the box.
  { name: 'dashboard', view: 'dashboard', component: DashboardView, w: 976, h: 660,
    config: { goals: [{ metric: 'distance', period: 'week', target: 40 }] } },
  { name: 'latest-hero', view: 'latest-hero', component: LatestHeroView, withDetail: true },
  { name: 'recent-activities', view: 'recent-activities', component: RecentActivitiesView },
  { name: 'stats-tiles', view: 'stats-tiles', component: StatsTilesView },
  { name: 'goal-progress', view: 'goal-progress', component: GoalProgressView,
    config: { goals: [
      { metric: 'distance', period: 'week', target: 40 },
      { metric: 'movingTime', period: 'year', target: 160 },
    ] } },
  { name: 'training-volume', view: 'training-volume', component: TrainingVolumeView },
  // 52 weeks × 7 days wants a wide, short stage — the band letterboxes
  // inside the standard box. Height is the one that makes the grid fill it:
  // at 976 wide the cell pitch is capped by width at ~17.8px, so seven rows
  // plus the month band come to ~140px, and anything taller is dead space.
  { name: 'heatmap', view: 'heatmap', component: HeatmapView, w: 976, h: 224 },
  { name: 'month-calendar', view: 'month-calendar', component: MonthCalendarView },
  { name: 'year-poster', view: 'year-poster', component: YearPosterView },
  { name: 'year-compare', view: 'year-compare', component: YearCompareView },
  { name: 'fitness', view: 'fitness', component: FitnessView },
  { name: 'route-map', view: 'route-map', component: RouteMapView },
  { name: 'route-gallery', view: 'route-gallery', component: RouteGalleryView },
  { name: 'planned-routes', view: 'planned-routes', component: PlannedRoutesView },
  { name: 'photos', view: 'photos', component: PhotoWallView },
  { name: 'records', view: 'records', component: RecordsView },
  { name: 'milestones', view: 'milestones', component: MilestonesView },
  { name: 'eddington', view: 'eddington', component: EddingtonView },
  { name: 'training-times', view: 'training-times', component: TrainingTimesView },
  { name: 'segment-prs', view: 'segment-prs', component: SegmentPrsView },
  { name: 'gear', view: 'gear', component: GearView },
  { name: 'athlete-card', view: 'athlete-card', component: AthleteCardView },
];

let shotBoxes = '';
for (const c of SHOTS) {
  const config: StravaConfig = { ...BASE_CONFIG, ...c.config, view: c.view };
  const bw = c.w ?? W;
  const bh = c.h ?? H;
  const cw = bw - MPAD * 2;
  const ch = bh - MPAD * 2;
  const props: ViewProps = {
    rows: shotRows,
    config,
    units: 'imperial',
    locale: 'en-US',
    now: MNOW,
    athlete: ATHLETE_M,
    athleteStats: ATHLETE_STATS,
    segments: SEGMENTS,
    routes: PLANNED_ROUTES,
    photos: PHOTOS_M,
    latestDetail: c.withDetail
      ? {
          ...LATEST_DETAIL_BASE,
          // The newest fixture activity is a run — bike gear would read wrong.
          gearName: 'Saucony Endorphin Speed 4',
          calories: 486,
          photoUrl: scenicPhoto(2),
          id: shotRows[0].id,
        }
      : null,
    updatedAt: new Date(MNOW.getTime() - 300_000),
    tier: tierFor(cw, ch),
    width: cw,
    height: ch,
  };
  let headerRight: string | undefined;
  if (c.view === 'dashboard') {
    headerRight = t('updated', {
      when: relativeTime(props.updatedAt!.toISOString(), 'en-US', MNOW, t('justNow')),
    });
  } else if (c.view === 'training-volume') {
    headerRight = t('perWeek', { unit: volumeUnit(config.volumeMetric, 'imperial') });
  }
  const body = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Header, { label: headerLabel(c.view, 'en-US', MNOW), right: headerRight }),
      React.createElement(c.component, props),
    ),
  );
  shotBoxes += `
    <div class="module" data-view="${c.name}" style="width:${bw}px;height:${bh}px">${body}</div>`;
}

const shotHtml = `<!doctype html><meta charset="utf-8"><style>
  body { background: #0d1220; margin: 0; padding: 24px; display: flex; flex-direction: column; gap: 24px;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .module { background:
      radial-gradient(130% 130% at 88% -12%, rgba(252,76,2,0.13), transparent 52%),
      radial-gradient(130% 130% at -8% 112%, rgba(252,76,2,0.06), transparent 52%),
      #0b0f1a;
    padding: ${MPAD}px; box-sizing: border-box; overflow: hidden;
    color: #f1f5f9; font-size: 16px; flex-shrink: 0;
    display: flex; flex-direction: column; }
</style>${shotBoxes}`;

const shotDir = join(import.meta.dirname, '.shots-marketing');
mkdirSync(shotDir, { recursive: true });
const shotPage = join(shotDir, 'harness.html');
writeFileSync(shotPage, shotHtml);

const maxW = Math.max(W, ...SHOTS.map((c) => c.w ?? W));
const maxH = Math.max(H, ...SHOTS.map((c) => c.h ?? H));
const shotBrowser = await chromium.launch();
const shotTab = await shotBrowser.newPage({
  viewport: { width: maxW + 60, height: maxH + 60 },
  deviceScaleFactor: 2,
});
await shotTab.goto(`file://${shotPage}`);
for (const c of SHOTS) {
  await shotTab
    .locator(`[data-view="${c.name}"]`)
    .screenshot({ path: join(shotDir, `${c.name}.png`) });
}
await shotBrowser.close();
console.log(`wrote ${SHOTS.length} shots to ${shotDir}`);
process.exit(0);
