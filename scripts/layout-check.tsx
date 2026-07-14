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

import type { ActivityRow, AthleteProfile, AthleteStats, StravaConfig } from '../src/types';
import { filterActivities, sortNewestFirst } from '../src/aggregate';
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
import { RouteGalleryView } from '../src/views-gallery';
import {
  MonthCalendarView,
  RecordsView,
  TrainingVolumeView,
  volumeUnit,
  YearPosterView,
} from '../src/views-insights';

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
};
const ATHLETE_STATS: AthleteStats = {
  allRideTotals: { count: 412, distance: 12_480_000, movingTime: 1_684_800, elevation: 96_400 },
  allRunTotals: { count: 655, distance: 5_940_000, movingTime: 1_527_600, elevation: 41_200 },
  allSwimTotals: { count: 38, distance: 61_500, movingTime: 90_000, elevation: 0 },
};

const BASE_CONFIG: StravaConfig = {
  view: 'stats-tiles',
  activityFilter: 'all',
  recentLimit: 5,
  goals: [],
  units: 'imperial',
  heatmapMetric: 'count',
  volumeMetric: 'distance',
  showMap: true,
  showHeader: true,
};

// ─── Matrix ─────────────────────────────────────────────────────────
// Outer module sizes (the plugin's RootFrame subtracts 16px padding per side).
const PADDING = 16;
const FONT_SIZE = 16;
const SIZES: [string, number, number][] = [
  ['wide-short', 1416, 520],
  ['screenshot-976x660', 976, 660],
  ['screenshot-936x536', 936, 536],
  ['screenshot-894x632', 894, 632],
  ['default-520x640', 520, 640],
  ['small-420x420', 420, 420],
  ['narrow-360x520', 360, 520],
  ['tall-640x980', 640, 980],
];

interface ViewCase {
  name: string;
  view: StravaConfig['view'];
  component: React.ComponentType<ViewProps>;
  config?: Partial<StravaConfig>;
  /** Override the activity fixture (e.g. an empty current week) */
  rows?: ActivityRow[];
}
const CASES: ViewCase[] = [
  { name: 'dashboard', view: 'dashboard', component: DashboardView,
    config: { goals: [{ metric: 'distance', period: 'week', target: 40 }] } },
  { name: 'dashboard-nogoal', view: 'dashboard', component: DashboardView },
  { name: 'dashboard-emptyweek', view: 'dashboard', component: DashboardView,
    rows: rows.filter(
      (r) => r.startDateLocal.slice(0, 10) < new Date(NOW.getTime() - 8 * DAY).toISOString().slice(0, 10),
    ),
    config: { goals: [{ metric: 'distance', period: 'year', target: 500 }] } },
  { name: 'stats-tiles', view: 'stats-tiles', component: StatsTilesView },
  { name: 'recent-activities', view: 'recent-activities', component: RecentActivitiesView },
  { name: 'route-gallery', view: 'route-gallery', component: RouteGalleryView },
  { name: 'training-volume', view: 'training-volume', component: TrainingVolumeView },
  { name: 'goal-progress', view: 'goal-progress', component: GoalProgressView,
    config: { goals: [
      { metric: 'distance', period: 'week', target: 40 },
      { metric: 'movingTime', period: 'year', target: 300 },
    ] } },
  { name: 'goal-progress-single', view: 'goal-progress', component: GoalProgressView,
    config: { goals: [{ metric: 'distance', period: 'year', target: 500 }] } },
  { name: 'heatmap', view: 'heatmap', component: HeatmapView },
  { name: 'month-calendar', view: 'month-calendar', component: MonthCalendarView },
  { name: 'year-poster', view: 'year-poster', component: YearPosterView },
  { name: 'records', view: 'records', component: RecordsView },
  { name: 'latest-hero', view: 'latest-hero', component: LatestHeroView },
  { name: 'athlete-card', view: 'athlete-card', component: AthleteCardView },
];

// Dead-space budget: whitespace beyond the flex gaps, top + bottom combined.
const deadBudget = (view: string, h: number) => Math.max(90, h * 0.3);
// Boxes where the budget is deliberately waived (overflow still checked).
const DEAD_SPACE_EXEMPT = new Set<string>([]);
// The heatmap band's aspect is fixed by the data (up to 52 weeks × 7 days at
// a legible cell size), so boxes that don't match it letterbox by design.
const DEAD_SPACE_EXEMPT_VIEWS = new Set<string>(['heatmap']);

// ─── Harness page ───────────────────────────────────────────────────
const sorted = sortNewestFirst(filterActivities(rows, 'all'));
let boxes = '';
for (const c of CASES) {
  const config: StravaConfig = { ...BASE_CONFIG, ...c.config, view: c.view };
  for (const [sizeName, w, h] of SIZES) {
    const cw = w - PADDING * 2;
    const ch = h - PADDING * 2;
    const props: ViewProps = {
      rows: c.rows ? sortNewestFirst(filterActivities(c.rows, 'all')) : sorted,
      config,
      units: 'imperial',
      locale: 'en-US',
      now: NOW,
      athlete: ATHLETE,
      athleteStats: ATHLETE_STATS,
      updatedAt: new Date(NOW.getTime() - 300_000),
      tier: tierFor(cw, ch),
      width: cw,
      height: ch,
    };
    let headerRight: string | undefined;
    if (c.view === 'dashboard') {
      headerRight = t('updated', {
        when: relativeTime(props.updatedAt!.toISOString(), 'en-US', NOW, t('justNow')),
      });
    } else if (c.view === 'training-volume') {
      headerRight = t('perWeek', { unit: volumeUnit(config.volumeMetric, 'imperial') });
    }
    const body = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Header, { label: headerLabel(c.view, 'en-US', NOW), right: headerRight }),
        React.createElement(c.component, props),
      ),
    );
    boxes += `
      <div class="module" data-view="${c.name}" data-size="${sizeName}"
           style="width:${w}px;height:${h}px">${body}</div>`;
  }
}
const html = `<!doctype html><meta charset="utf-8"><style>
  body { background: #0d1220; margin: 0; padding: 24px; display: flex; flex-direction: column; gap: 24px;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .module { background: rgba(8,10,18,0.92); border-radius: 12px; padding: ${PADDING}px;
            box-sizing: border-box; overflow: hidden; color: #f1f5f9; font-size: ${FONT_SIZE}px;
            flex-shrink: 0; display: flex; flex-direction: column; }
  img { visibility: hidden; }
</style>${boxes}`;

const outDir = join(import.meta.dirname, '.shots');
mkdirSync(outDir, { recursive: true });
const harnessPath = join(outDir, 'harness.html');
writeFileSync(harnessPath, html);

// ─── Measure ────────────────────────────────────────────────────────
interface Metric {
  view: string; size: string; boxH: number;
  dead: number; overflowV: number; overflowH: number;
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
await page.goto(`file://${harnessPath}`);

const metrics: Metric[] = await page.$$eval('.module', (els) =>
  els.map((m) => {
    // The rendered content rect of an element; letterboxed SVGs (viewBox +
    // preserveAspectRatio "meet") report the drawn area, not the layout box,
    // so a chart centered in a stretched container still reads as dead space.
    const visualRect = (el: Element): DOMRect => {
      const r = el.getBoundingClientRect();
      const svg = el.matches('svg[viewBox]')
        ? el
        : el.querySelector(':scope > svg[viewBox], :scope > * > svg[viewBox]');
      if (!svg) return r;
      const sr = svg.getBoundingClientRect();
      if (sr.width * sr.height < 0.8 * r.width * r.height) return r;
      const par = svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
      if (par.includes('none') || par.includes('slice')) return r;
      const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || !vb[2] || !vb[3]) return r;
      const aspect = vb[2] / vb[3];
      let w = sr.width;
      let h = sr.height;
      if (w / h > aspect) w = h * aspect;
      else h = w / aspect;
      return new DOMRect(sr.left + (sr.width - w) / 2, sr.top + (sr.height - h) / 2, w, h);
    };

    // module children: [header, view root]. Measure the header plus the view
    // root's children so a stretched (flex:1) root doesn't mask dead space.
    const kids: Element[] = [];
    const header = m.children[0];
    const root = m.children[1];
    if (header) kids.push(header);
    if (root) {
      if (root.children.length) kids.push(...Array.from(root.children));
      else kids.push(root);
    }
    const rects = kids
      .map((k) => visualRect(k))
      .filter((r) => r.height > 0 && r.width > 0);
    const style = getComputedStyle(m);
    const pad = parseFloat(style.paddingTop);
    const box = m.getBoundingClientRect();
    const contentTop = box.top + pad;
    const contentH = m.clientHeight - pad * 2;
    const contentW = m.clientWidth - pad * 2;
    let dead = contentH;
    let overflowV = 0;
    let overflowH = 0;
    if (rects.length) {
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      dead = Math.round(contentH - (bottom - top));
      overflowV = Math.round(Math.max(0, top < contentTop - 1 ? contentTop - top : 0)
        + Math.max(0, bottom - (contentTop + contentH + 1)));
      overflowH = Math.round(Math.max(0, (right - left) - contentW - 1));
    }
    return {
      view: m.getAttribute('data-view') as string,
      size: m.getAttribute('data-size') as string,
      boxH: Math.round(contentH), dead, overflowV, overflowH,
    };
  }),
);

for (const c of CASES) {
  for (const [sizeName] of SIZES) {
    const el = page.locator(`[data-view="${c.name}"][data-size="${sizeName}"]`);
    await el.screenshot({ path: join(outDir, `${c.name}--${sizeName}.png`) });
  }
}
await browser.close();

// ─── Report ─────────────────────────────────────────────────────────
let failures = 0;
console.log('view                 size                 boxH  dead  ovV  ovH  verdict');
for (const m of metrics) {
  const exempt =
    DEAD_SPACE_EXEMPT_VIEWS.has(m.view) || DEAD_SPACE_EXEMPT.has(`${m.view}@${m.size}`);
  const tooEmpty = !exempt && m.dead > deadBudget(m.view, m.boxH);
  const overflows = m.overflowV > 2 || m.overflowH > 2;
  const verdict = overflows ? 'FAIL overflow' : tooEmpty ? 'FAIL dead-space' : 'ok';
  if (verdict !== 'ok') failures++;
  console.log(
    `${m.view.padEnd(21)}${m.size.padEnd(21)}${String(m.boxH).padEnd(6)}`
    + `${String(m.dead).padEnd(6)}${String(m.overflowV).padEnd(5)}${String(m.overflowH).padEnd(5)}${verdict}`,
  );
}
console.log(failures ? `\n${failures} failing box(es)` : '\nall boxes within budget');
process.exit(failures ? 1 : 0);
