/** The six display views. All sizing is em-driven off the module's fontSize. */

import React from 'react';
import type {
  ActivityRow,
  AthleteProfile,
  AthleteStats,
  ActivityTotals,
  GoalMetric,
  GoalPeriod,
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
import { decodePolyline, polylineToPath } from './polyline';
import { SportIcon } from './icons';
import { sportLabel, t } from './i18n';

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
  /** Last successful fetch, for the dashboard's "updated …" note */
  updatedAt?: Date | null;
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

function TileRow({ label, tiles }: { label: string; tiles: { value: string; label: string }[] }) {
  return (
    <div style={{ minHeight: 0 }}>
      <div
        style={{
          fontSize: '0.7em',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.55,
          marginBottom: '0.5em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: '1em' }}>
        {tiles.map((tile, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1.45em', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {tile.value}
            </div>
            <div style={{ fontSize: '0.7em', opacity: 0.55 }}>{tile.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsTilesView({ rows, units, locale, now }: ViewProps) {
  const week = totalsForPeriod(rows, 'week', now);
  const year = totalsForPeriod(rows, 'year', now);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        gap: '1em',
      }}
    >
      <TileRow
        label={t('thisWeek')}
        tiles={[
          { value: formatDistance(week.distance, units, locale), label: t('distance') },
          { value: formatDuration(week.movingTime), label: t('time') },
          { value: formatNumber(week.count, locale), label: t('activities') },
        ]}
      />
      <TileRow
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

export function RecentActivitiesView({ rows, config, units, locale, now }: ViewProps) {
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

export function GoalProgressView({ rows, config, units, locale, now }: ViewProps) {
  if (config.goals.length === 0) return <CenterMessage body={t('noGoals')} />;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexWrap: 'wrap',
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
            <GoalRing fraction={p.fraction} label={`${Math.round(p.fraction * 100)}%`} />
            <div style={{ textAlign: 'center' }}>
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

const TIER_COLORS = [
  'rgba(255,255,255,0.08)',
  'rgba(252,76,2,0.3)',
  'rgba(252,76,2,0.5)',
  'rgba(252,76,2,0.75)',
  STRAVA_ORANGE,
];

export function HeatmapView({ rows, config, locale, now }: ViewProps) {
  const WEEKS = 52;
  const grid = heatmapDayGrid(now, WEEKS);
  const buckets = bucketByDay(rows);
  const todayKey = dayKey(now);

  let max = 0;
  const values = grid.map((col) =>
    col.map((key) => {
      const v = heatmapValue(buckets.get(key), config.heatmapMetric);
      if (v > max) max = v;
      return { key, v };
    }),
  );

  const CELL = 10;
  const GAP = 2;
  const LABEL_W = 14;
  const width = LABEL_W + WEEKS * (CELL + GAP) - GAP;
  const height = 7 * (CELL + GAP) - GAP;

  // M/W/F row labels from the locale's narrow weekday names
  const monday = startOfIsoWeek(now);
  const labelFor = (offset: number): string => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(monday, offset));
    } catch {
      return ['M', '', 'W', '', 'F', '', ''][offset] ?? '';
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%' }}
      >
        {[0, 2, 4].map((r) => (
          <text
            key={r}
            x={LABEL_W - 4}
            y={r * (CELL + GAP) + CELL - 2}
            textAnchor="end"
            fill="currentColor"
            opacity={0.5}
            style={{ fontSize: 7 }}
          >
            {labelFor(r)}
          </text>
        ))}
        {values.map((col, c) =>
          col.map(({ key, v }, r) => {
            if (key > todayKey) return null; // don't render the future
            return (
              <rect
                key={key}
                x={LABEL_W + c * (CELL + GAP)}
                y={r * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={TIER_COLORS[tierFor(v, max)]}
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
              backgroundColor: 'rgba(0,0,0,0.45)',
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

export function LatestHeroView({ rows, config, units, locale, now }: ViewProps) {
  const a = rows[0];
  if (!a) return <CenterMessage body={t('noActivities')} />;
  const ps = formatPaceOrSpeed(a, units, locale);
  const path =
    config.showMap && a.polyline ? polylineToPath(decodePolyline(a.polyline), 100, 60) : '';
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.7em' }}>
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
      </div>
      {path && (
        <div style={{ flex: 1, minHeight: '3em' }}>
          <svg
            viewBox="0 0 100 60"
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
      <div
        style={{
          display: 'flex',
          gap: '1em',
          fontSize: '0.75em',
          opacity: 0.6,
          alignItems: 'center',
        }}
      >
        <span>
          {formatNumber(a.kudosCount, locale)} {t('kudos')}
        </span>
        {a.prCount > 0 && <span>{t('prCount', { count: a.prCount })}</span>}
        {a.deviceName && <span style={{ marginLeft: 'auto' }}>{a.deviceName}</span>}
      </div>
    </div>
  );
}

// ─── Athlete card ────────────────────────────────────────────────────────────

function ProfilePhoto({ athlete }: { athlete: AthleteProfile }) {
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
          color: '#fff',
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

function LifetimeColumn({
  sport,
  label,
  totals,
  units,
  locale,
}: {
  sport: string;
  label: string;
  totals: ActivityTotals | undefined;
  units: Units;
  locale: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.35em' }}>
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
      <div style={{ fontSize: '1.2em', fontWeight: 700 }}>
        {totals ? formatNumber(totals.count, locale) : '–'}
      </div>
      <div style={{ fontSize: '0.75em', opacity: 0.65 }}>
        {totals ? formatDistance(totals.distance, units, locale) : '–'}
      </div>
      <div style={{ fontSize: '0.75em', opacity: 0.65 }}>
        {totals ? formatDuration(totals.movingTime) : '–'}
      </div>
    </div>
  );
}

export function AthleteCardView({ athlete, athleteStats, units, locale }: ViewProps) {
  if (!athlete) return <CenterMessage body={t('loading')} />;
  const location = [athlete.city, athlete.state, athlete.country].filter(Boolean).join(', ');
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '1em' }}>
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
          {location && <div style={{ fontSize: '0.8em', opacity: 0.6 }}>{location}</div>}
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
      <div style={{ flex: 1, display: 'flex', gap: '1em', minHeight: 0 }}>
        <LifetimeColumn
          sport="Ride"
          label={t('rides')}
          totals={athleteStats?.allRideTotals}
          units={units}
          locale={locale}
        />
        <LifetimeColumn
          sport="Run"
          label={t('runs')}
          totals={athleteStats?.allRunTotals}
          units={units}
          locale={locale}
        />
        <LifetimeColumn
          sport="Swim"
          label={t('swims')}
          totals={athleteStats?.allSwimTotals}
          units={units}
          locale={locale}
        />
      </div>
    </div>
  );
}
