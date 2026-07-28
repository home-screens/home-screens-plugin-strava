/** The six display views. All sizing is em-driven off the module's fontSize. */

import React from 'react';
import type {
  ActivityDetail,
  ActivityRow,
  AthleteProfile,
  AthleteStats,
  ActivityTotals,
  GoalMetric,
  GoalPeriod,
  PhotoItem,
  PlannedRoute,
  StarredSegment,
  StravaConfig,
  Units,
} from './types';
import { bucketByDay, goalProgress, heatmapValue, tierFor, totalsForPeriod } from './aggregate';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatPaceOrSpeed,
  initials,
  relativeTime,
  truncate,
} from './format';
import { addDays, dayKey, heatmapDayGrid, startOfIsoWeek } from './date-ranges';
import { decodePolyline, polylineToPath, routeAspect } from './polyline';
import { SportIcon } from './icons';
import { sportLabel, t } from './i18n';
import { typeScale, type SizeTier } from './size';
import { useTheme, type Theme } from './theme';

export const STRAVA_ORANGE = '#FC4C02';

export interface ViewProps {
  /** Filtered, newest-first */
  rows: ActivityRow[];
  config: StravaConfig;
  units: Units;
  locale: string;
  now: Date;
  athlete?: AthleteProfile | null;
  athleteStats?: AthleteStats | null;
  /** Starred segments with athlete PRs; only fetched for the segment-prs view */
  segments?: StarredSegment[] | null;
  /** Saved routes; only fetched for the planned-routes view */
  routes?: PlannedRoute[] | null;
  /** Primary photos of recent photo-bearing activities; only for the photos view */
  photos?: PhotoItem[] | null;
  /** Detailed extras for the latest activity; only fetched for latest-hero */
  latestDetail?: ActivityDetail | null;
  /** Last successful fetch, for the dashboard's "updated …" note */
  updatedAt?: Date | null;
  /** Measured module box, bucketed into a discrete layout tier */
  tier: SizeTier;
  width: number;
  height: number;
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

export function CenterMessage({ title, body }: { title?: string; body: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5em',
        textAlign: 'center',
        padding: '0 1em',
      }}
    >
      {title && <div style={{ fontSize: '1.1em', fontWeight: 700 }}>{title}</div>}
      <div style={{ fontSize: '0.85em', opacity: 0.65 }}>{body}</div>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '1.15em', fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</div>
      <div
        style={{
          fontSize: '0.65em',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.55,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Stats tiles ─────────────────────────────────────────────────────────────

function TileRow({
  label,
  tiles,
  valueEm,
}: {
  label: string;
  tiles: { value: string; label: string }[];
  valueEm: number;
}) {
  const hue = useTheme();
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontSize: '0.7em',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.55,
          marginBottom: '0.5em',
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1px',
          background: hue.fg(0.08),
          border: `1px solid ${hue.fg(0.08)}`,
          borderRadius: '0.85em',
          overflow: 'hidden',
        }}
      >
        {tiles.map((tile, i) => (
          <div
            key={i}
            style={{
              minWidth: 0,
              background: hue.fg(0.045),
              padding: '0.75em 0.9em',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: `${valueEm}em`, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {tile.value}
            </div>
            <div style={{ fontSize: '0.7em', opacity: 0.55, marginTop: '0.15em' }}>
              {tile.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsTilesView({ rows, units, locale, now, width, height }: ViewProps) {
  const week = totalsForPeriod(rows, 'week', now);
  const year = totalsForPeriod(rows, 'year', now);
  // Long values ("61,398 ft") need a smaller size to fit narrow cells
  const valueEm = width < 480 ? 1.2 : 1.45;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '1em',
        fontSize: `${typeScale(width, height, 520, 360, 2)}em`,
      }}
    >
      <TileRow
        valueEm={valueEm}
        label={t('thisWeek')}
        tiles={[
          { value: formatDistance(week.distance, units, locale), label: t('distance') },
          { value: formatDuration(week.movingTime), label: t('time') },
          { value: formatNumber(week.count, locale), label: t('activities') },
        ]}
      />
      <TileRow
        valueEm={valueEm}
        label={t('thisYear')}
        tiles={[
          { value: formatDistance(year.distance, units, locale), label: t('distance') },
          { value: formatElevation(year.elevation, units, locale), label: t('elevation') },
          { value: formatNumber(year.count, locale), label: t('activities') },
        ]}
      />
    </div>
  );
}

// ─── Recent activities ───────────────────────────────────────────────────────

export function RecentActivitiesView({ rows, config, units, locale, now, width, height }: ViewProps) {
  const shown = rows.slice(0, config.recentLimit);
  if (shown.length === 0) return <CenterMessage body={t('noActivities')} />;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        gap: '0.4em',
        overflow: 'hidden',
        fontSize: `${typeScale(width, height, 560, shown.length * 90 + 50, 1.6)}em`,
      }}
    >
      {shown.map((a) => {
        const ps = formatPaceOrSpeed(a, units, locale);
        const hasDistance = a.distance > 0;
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
            <span style={{ color: STRAVA_ORANGE, display: 'flex' }}>
              <SportIcon type={a.type} size="1.4em" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {truncate(a.name, 48)}
                {a.isRace && (
                  <span
                    style={{
                      fontSize: '0.6em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginLeft: '0.9em',
                      padding: '0.2em 0.9em',
                      borderRadius: '1em',
                      background: 'rgba(252,76,2,0.16)',
                      color: '#ff8a5c',
                      verticalAlign: 'middle',
                    }}
                  >
                    {t('race')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75em', opacity: 0.55 }}>
                {relativeTime(a.startDate, locale, now, t('justNow'))}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {hasDistance
                  ? formatDistance(a.distance, units, locale)
                  : formatDuration(a.movingTime)}
              </div>
              <div style={{ fontSize: '0.75em', opacity: 0.55 }}>
                {hasDistance ? (ps?.value ?? formatDuration(a.movingTime)) : sportLabel(a.type)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Goal progress ───────────────────────────────────────────────────────────

export function metricLabel(metric: GoalMetric): string {
  if (metric === 'distance') return t('distance');
  if (metric === 'movingTime') return t('time');
  return t('elevation');
}

export function periodLabel(period: GoalPeriod): string {
  return period === 'week' ? t('week') : t('year');
}

export function goalValue(metric: GoalMetric, v: number, units: Units, locale: string): string {
  if (metric === 'distance') {
    return `${formatNumber(v, locale, v < 100 ? 1 : 0)} ${units === 'imperial' ? 'mi' : 'km'}`;
  }
  if (metric === 'movingTime') return `${formatNumber(v, locale, 1)} h`;
  return `${formatNumber(Math.round(v), locale)} ${units === 'imperial' ? 'ft' : 'm'}`;
}

export function OnTrackBadge({ onTrack }: { onTrack: boolean }) {
  return (
    <div
      style={{
        display: 'inline-block',
        fontSize: '0.6em',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        padding: '0.25em 0.9em',
        borderRadius: '1em',
        backgroundColor: onTrack ? 'rgba(74,222,128,0.2)' : 'rgba(127,127,127,0.25)',
        color: onTrack ? '#4ade80' : 'inherit',
        opacity: onTrack ? 1 : 0.75,
      }}
    >
      {onTrack ? t('onTrack') : t('behind')}
    </div>
  );
}

export function GoalRing({
  fraction,
  label,
  size = '6.5em',
}: {
  fraction: number;
  label: string;
  size?: string;
}) {
  const C = 2 * Math.PI * 42;
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(127,127,127,0.3)" strokeWidth="10" />
      {fraction > 0 && (
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={STRAVA_ORANGE}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${C * fraction} ${C}`}
          transform="rotate(-90 50 50)"
        />
      )}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        style={{ fontSize: 22, fontWeight: 700 }}
      >
        {label}
      </text>
    </svg>
  );
}

export function GoalProgressView({ rows, config, units, locale, now, width, height }: ViewProps) {
  if (config.goals.length === 0) return <CenterMessage body={t('noGoals')} />;
  const n = config.goals.length;
  // Rings scale with the measured box; tall boxes stack goals vertically so
  // the column fills instead of leaving a band of dead space. The ring gets
  // the height left after the caption block (~0.36 × ring) is reserved.
  const availH = Math.max(height - (config.showHeader ? 48 : 4), 80);
  const column = n > 1 && height > width * 1.15;
  const ringPx = Math.round(
    column
      ? Math.min(width * 0.5, (availH / n - 30) / 1.35)
      : Math.min((width / n) * (n === 1 ? 0.85 : 0.78), (availH - 40) / 1.4, 560),
  );
  const ring = Math.max(90, ringPx);
  // The ring is sized in px, so scale the caption type with it separately
  const textScale = Math.max(1, Math.min(ring / 160, 1.8));
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: column ? 'column' : 'row',
        flexWrap: column ? undefined : 'wrap',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        gap: '1em',
        overflow: 'hidden',
      }}
    >
      {config.goals.map((goal, i) => {
        const p = goalProgress(rows, goal, units, now);
        return (
          <div
            key={i}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5em' }}
          >
            <GoalRing
              fraction={p.fraction}
              label={`${Math.round(p.fraction * 100)}%`}
              size={`${ring}px`}
            />
            <div style={{ textAlign: 'center', fontSize: `${textScale}em` }}>
              <div
                style={{
                  fontSize: '0.75em',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  opacity: 0.7,
                }}
              >
                {periodLabel(goal.period)} · {metricLabel(goal.metric)}
              </div>
              <div style={{ fontSize: '0.85em', opacity: 0.85 }}>
                {t('progressOf', {
                  current: goalValue(goal.metric, p.current, units, locale),
                  target: goalValue(goal.metric, p.target, units, locale),
                })}
              </div>
              {p.onTrack !== null && (
                <div style={{ marginTop: '0.35em' }}>
                  <OnTrackBadge onTrack={p.onTrack} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

/** Heatmap tiers: an empty cell in the host's text color, then the brand
 *  orange deepening with volume. A function of the theme rather than a
 *  constant, because the empty tier follows the Text color. */
const tierColors = (hue: Theme) => [
  hue.fg(0.08),
  'rgba(252,76,2,0.3)',
  'rgba(252,76,2,0.5)',
  'rgba(252,76,2,0.75)',
  STRAVA_ORANGE,
];

export function HeatmapView({ rows, config, locale, now, width, height }: ViewProps) {
  const hue = useTheme();
  const tiers = tierColors(hue);
  const buckets = bucketByDay(rows);
  const todayKey = dayKey(now);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // One continuous grid, never wrapped. As many weeks as fit at a minimum
  // legible cell size, up to the full year — so a bigger module always shows
  // more weeks, and cells only grow once all 52 are visible. Weeks run
  // horizontally in wide boxes and vertically in tall ones (whichever axis
  // fits more weeks). Laid out in px (not a scaled viewBox) so labels stay
  // legible at every module size.
  const DOW_W = 20; // weekday gutter, horizontal mode
  const MONTH_H = 16; // month band, horizontal mode
  const MONTH_W = 34; // month gutter, vertical mode
  const DOW_H = 16; // weekday band, vertical mode
  const MIN_PITCH = 12; // 10px cell + 2px gap
  const MAX_PITCH = 36;
  const availW = Math.max(width, 120);
  const availH = Math.max(height - (config.showHeader ? 48 : 4), 90);

  const hWeeks = clamp(Math.floor((availW - DOW_W) / MIN_PITCH), 4, 52);
  const vWeeks = clamp(Math.floor((availH - DOW_H) / MIN_PITCH), 4, 52);
  const horizontal = hWeeks >= vWeeks;
  const weeks = horizontal ? hWeeks : vWeeks;
  const pitch = horizontal
    ? Math.min((availW - DOW_W) / weeks, (availH - MONTH_H) / 7, MAX_PITCH)
    : Math.min((availH - DOW_H) / weeks, (availW - MONTH_W) / 7, MAX_PITCH);
  const svgW = horizontal ? DOW_W + weeks * pitch : MONTH_W + 7 * pitch;
  const svgH = horizontal ? MONTH_H + 7 * pitch : DOW_H + weeks * pitch;
  const cell = pitch - Math.max(2, pitch * 0.16);
  const rx = Math.min(6, cell * 0.2);

  const grid = heatmapDayGrid(now, weeks);
  let max = 0;
  const values = grid.map((col) =>
    col.map((key) => {
      const v = heatmapValue(buckets.get(key), config.heatmapMetric);
      if (v > max) max = v;
      return { key, v };
    }),
  );

  // M/W/F row labels from the locale's narrow weekday names
  const monday = startOfIsoWeek(now);
  const labelFor = (offset: number): string => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(monday, offset));
    } catch {
      return ['M', '', 'W', '', 'F', '', ''][offset] ?? '';
    }
  };
  // Month indicator on the week column where the month changes
  const monthOf = (col: string[]) => col[0].slice(0, 7);
  const monthLabel = (col: string[]) => {
    const [y, m, d] = col[0].split('-').map(Number);
    try {
      return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, d));
    } catch {
      return '';
    }
  };
  const monthMarks: { week: number; label: string }[] = [];
  for (let w = 1; w < grid.length; w++) {
    if (monthOf(grid[w]) !== monthOf(grid[w - 1])) {
      monthMarks.push({ week: w, label: monthLabel(grid[w]) });
    }
  }

  const cellX = (w: number, d: number) => (horizontal ? DOW_W + w * pitch : MONTH_W + d * pitch);
  const cellY = (w: number, d: number) => (horizontal ? MONTH_H + d * pitch : DOW_H + w * pitch);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <svg width={svgW} height={svgH} style={{ maxWidth: '100%', maxHeight: '100%' }}>
        {[0, 2, 4].map((d) =>
          horizontal ? (
            <text
              key={d}
              x={DOW_W - 6}
              y={MONTH_H + d * pitch + cell / 2}
              textAnchor="end"
              dominantBaseline="central"
              fill="currentColor"
              opacity={0.5}
              style={{ fontSize: 11 }}
            >
              {labelFor(d)}
            </text>
          ) : (
            <text
              key={d}
              x={MONTH_W + d * pitch + cell / 2}
              y={DOW_H - 5}
              textAnchor="middle"
              fill="currentColor"
              opacity={0.5}
              style={{ fontSize: 11 }}
            >
              {labelFor(d)}
            </text>
          ),
        )}
        {monthMarks.map(({ week, label }) =>
          horizontal ? (
            // skip labels that would clip at the right edge
            week < weeks - 2 && (
              <text
                key={week}
                x={DOW_W + week * pitch}
                y={MONTH_H - 5}
                fill="currentColor"
                opacity={0.5}
                style={{ fontSize: 11 }}
              >
                {label}
              </text>
            )
          ) : (
            <text
              key={week}
              x={MONTH_W - 6}
              y={DOW_H + week * pitch + cell / 2}
              textAnchor="end"
              dominantBaseline="central"
              fill="currentColor"
              opacity={0.5}
              style={{ fontSize: 11 }}
            >
              {label}
            </text>
          ),
        )}
        {values.map((col, w) =>
          col.map(({ key, v }, d) => {
            if (key > todayKey) return null; // don't render the future
            return (
              <rect
                key={key}
                x={cellX(w, d)}
                y={cellY(w, d)}
                width={cell}
                height={cell}
                rx={rx}
                fill={tiers[tierFor(v, max)]}
              />
            );
          }),
        )}
      </svg>
      {rows.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.85em',
              opacity: 0.8,
              padding: '0.3em 1em',
              borderRadius: '1em',
              backgroundColor: hue.shade(0.45),
            }}
          >
            {t('noActivities')}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Latest activity hero ────────────────────────────────────────────────────

export function LatestHeroView({
  rows,
  config,
  units,
  locale,
  now,
  width,
  height,
  latestDetail,
}: ViewProps) {
  const a = rows[0];
  if (!a) return <CenterMessage body={t('noActivities')} />;
  // The detail arrives a beat later (separate fetch); ignore it if the
  // latest activity changed in between.
  const detail = latestDetail && latestDetail.id === a.id ? latestDetail : null;
  const ps = formatPaceOrSpeed(a, units, locale);
  // Canvas matches the route's own aspect so the drawing fills the map area
  // instead of floating in a fixed landscape viewBox
  const pts = config.showMap && a.polyline ? decodePolyline(a.polyline) : [];
  const vbH = Math.round(100 / Math.max(0.33, Math.min(routeAspect(pts), 3)));
  const path = pts.length >= 2 ? polylineToPath(pts, 100, vbH) : '';
  const photo = detail?.photoUrl;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7em',
        fontSize: `${typeScale(width, height, 520, 420, 1.8)}em`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
        <span style={{ color: STRAVA_ORANGE, display: 'flex' }}>
          <SportIcon type={a.type} size="1.7em" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '1.25em',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {truncate(a.name, 60)}
          </div>
          <div style={{ fontSize: '0.75em', opacity: 0.55 }}>
            {sportLabel(a.type)} · {relativeTime(a.startDate, locale, now, t('justNow'))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1.5em', flexWrap: 'wrap' }}>
        {a.distance > 0 && (
          <Stat value={formatDistance(a.distance, units, locale)} label={t('distance')} />
        )}
        <Stat value={formatDuration(a.movingTime)} label={t('time')} />
        {ps && a.distance > 0 && (
          <Stat value={ps.value} label={ps.kind === 'pace' ? t('pace') : t('speed')} />
        )}
        {a.elevation > 0 && (
          <Stat value={formatElevation(a.elevation, units, locale)} label={t('elevation')} />
        )}
        {detail?.calories != null && detail.calories > 0 && (
          <Stat
            value={`${formatNumber(Math.round(detail.calories), locale)} kcal`}
            label={t('calories')}
          />
        )}
      </div>
      {(path || photo) && (
        <div style={{ flex: 1, minHeight: '3em', display: 'flex', gap: '0.7em' }}>
          {path && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <svg
                viewBox={`0 0 100 ${vbH}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%', height: '100%' }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={STRAVA_ORANGE}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
          {photo && (
            <img
              src={photo}
              alt=""
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                objectFit: 'cover',
                borderRadius: '0.85em',
              }}
            />
          )}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: '1em',
          fontSize: '0.75em',
          opacity: 0.6,
          alignItems: 'center',
        }}
      >
        {a.isRace && (
          <span style={{ color: '#ff8a5c', fontWeight: 700, textTransform: 'uppercase' }}>
            {t('race')}
          </span>
        )}
        <span>
          {formatNumber(a.kudosCount, locale)} {t('kudos')}
        </span>
        {a.prCount > 0 && <span>{t('prCount', { count: a.prCount })}</span>}
        {(detail?.gearName || a.deviceName) && (
          <span
            style={{
              marginLeft: 'auto',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {[detail?.gearName, a.deviceName].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Athlete card ────────────────────────────────────────────────────────────

function ProfilePhoto({ athlete }: { athlete: AthleteProfile }) {
  const hue = useTheme();
  const [failed, setFailed] = React.useState(false);
  const url = athlete.profile;
  // Strava serves a generic placeholder path for athletes with no photo
  const isPlaceholder = !url || url.includes('avatar/athlete');
  if (isPlaceholder || failed) {
    return (
      <div
        style={{
          width: '4em',
          height: '4em',
          borderRadius: '50%',
          backgroundColor: STRAVA_ORANGE,
          color: hue.fg(1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1em',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '1.4em' }}>{initials(athlete.firstName, athlete.lastName)}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      style={{
        width: '4em',
        height: '4em',
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  );
}

function LifetimeCell({
  sport,
  label,
  totals,
  ytd,
  units,
  locale,
}: {
  sport: string;
  label: string;
  totals: ActivityTotals | undefined;
  ytd: ActivityTotals | undefined;
  units: Units;
  locale: string;
}) {
  const hue = useTheme();
  return (
    <div
      style={{
        minWidth: 0,
        background: hue.fg(0.045),
        padding: '1em 1.15em',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: '0.35em',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4em',
          color: STRAVA_ORANGE,
          fontWeight: 600,
        }}
      >
        <SportIcon type={sport} size="1.1em" />
        <span style={{ fontSize: '0.8em', color: 'inherit' }}>{label}</span>
      </div>
      <div style={{ fontSize: '2em', fontWeight: 700, lineHeight: 1.1 }}>
        {totals ? formatNumber(totals.count, locale) : '–'}
      </div>
      <div style={{ fontSize: '0.9em', opacity: 0.65 }}>
        {totals ? formatDistance(totals.distance, units, locale) : '–'}
      </div>
      <div style={{ fontSize: '0.9em', opacity: 0.65 }}>
        {totals ? formatDuration(totals.movingTime) : '–'}
      </div>
      {ytd && ytd.count > 0 && (
        <div style={{ fontSize: '0.8em', color: '#ff8a5c' }}>
          {t('ytdLine', { value: formatDistance(ytd.distance, units, locale) })}
        </div>
      )}
    </div>
  );
}

export function AthleteCardView({ athlete, athleteStats, units, locale, width, height }: ViewProps) {
  const hue = useTheme();
  if (!athlete) return <CenterMessage body={t('loading')} />;
  const location = [athlete.city, athlete.state, athlete.country].filter(Boolean).join(', ');
  const subtitle = [
    location,
    typeof athlete.followerCount === 'number' && athlete.followerCount > 0
      ? t('followers', { count: athlete.followerCount })
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '1em',
        fontSize: `${typeScale(width, height, 560, 420, 1.8)}em`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1em' }}>
        <ProfilePhoto athlete={athlete} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '1.3em',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {athlete.firstName} {athlete.lastName}
          </div>
          {subtitle && <div style={{ fontSize: '0.8em', opacity: 0.6 }}>{subtitle}</div>}
        </div>
      </div>
      <div
        style={{
          fontSize: '0.7em',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.55,
        }}
      >
        {t('allTime')}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1px',
          background: hue.fg(0.08),
          border: `1px solid ${hue.fg(0.08)}`,
          borderRadius: '0.85em',
          overflow: 'hidden',
        }}
      >
        <LifetimeCell
          sport="Ride"
          label={t('rides')}
          totals={athleteStats?.allRideTotals}
          ytd={athleteStats?.ytdRideTotals}
          units={units}
          locale={locale}
        />
        <LifetimeCell
          sport="Run"
          label={t('runs')}
          totals={athleteStats?.allRunTotals}
          ytd={athleteStats?.ytdRunTotals}
          units={units}
          locale={locale}
        />
        <LifetimeCell
          sport="Swim"
          label={t('swims')}
          totals={athleteStats?.allSwimTotals}
          ytd={athleteStats?.ytdSwimTotals}
          units={units}
          locale={locale}
        />
      </div>
    </div>
  );
}
