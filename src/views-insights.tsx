/** Insight views: training volume, year poster, records, month calendar,
 *  Eddington number, and training-time distributions. */

import React from 'react';
import type { ActivityRow } from './types';
import {
  activeDays,
  activityRecords,
  bucketByDay,
  eddington,
  heatmapValue,
  hourDistribution,
  kudosForRange,
  streaks,
  tierFor,
  totalsForRange,
  weekdayDistribution,
  weeklyTotals,
  type PeriodTotals,
  type TimeBucketTotals,
} from './aggregate';
import {
  everestCount,
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatPaceOrSpeed,
  marathonCount,
  METERS_PER_MILE,
  shortDate,
  truncate,
} from './format';
import { addDays, monthCalendarGrid, periodBounds, startOfIsoWeek } from './date-ranges';
import { ActivityIcon, HeartIcon, MountainIcon, SportIcon } from './icons';
import { t } from './i18n';
import { typeScale } from './size';
import { CenterMessage, STRAVA_ORANGE, Stat, type ViewProps } from './views';
import { useTheme, type Theme } from './theme';

// ─── Training volume ─────────────────────────────────────────────────────────

const VOLUME_WEEKS = 12;

export function volumeUnit(metric: 'distance' | 'movingTime', units: 'metric' | 'imperial'): string {
  if (metric === 'movingTime') return 'h';
  return units === 'imperial' ? 'mi' : 'km';
}

export function TrainingVolumeView({ rows, config, units, locale, now, width, height }: ViewProps) {
  const hue = useTheme();
  const weeks = weeklyTotals(rows, VOLUME_WEEKS, now);
  const metric = config.volumeMetric;
  const toValue = (totals: PeriodTotals) =>
    metric === 'movingTime'
      ? totals.movingTime / 3600
      : units === 'imperial'
        ? totals.distance / METERS_PER_MILE
        : totals.distance / 1000;
  const values = weeks.map(toValue);
  const max = Math.max(...values);
  const peakIdx = values.indexOf(max);
  const curIdx = values.length - 1;
  const avg = values.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, values.length);
  const total = values.reduce((a, b) => a + b, 0);
  const unit = volumeUnit(metric, units);
  const fmt = (v: number) => formatNumber(v, locale, v < 10 ? 1 : 0);

  // Sparse x labels: month name where a new month starts, "now" on the current week
  const monthName = (d: Date): string => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d);
    } catch {
      return '';
    }
  };
  const xLabels = weeks.map((w, i) => {
    if (i === curIdx) return t('now');
    if (i > 0 && w.weekStart.getMonth() !== weeks[i - 1].weekStart.getMonth()) {
      return monthName(w.weekStart);
    }
    return '';
  });

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        fontSize: `${typeScale(width, height, 620, 520, 1.4)}em`,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative', marginTop: '1.4em' }}>
        {max > 0 && avg > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(1 - avg / max) * 100}%`,
              borderTop: `1px dashed ${hue.fg(0.4)}`,
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: '-1.5em',
                fontSize: '0.7em',
                color: hue.fg(0.55),
              }}
            >
              {t('fourWeekAvg', { value: fmt(avg) })}
            </span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.55em',
            height: '100%',
          }}
        >
          {values.map((v, i) => {
            const isCur = i === curIdx;
            const showLabel = v > 0 && (i === peakIdx || isCur);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  position: 'relative',
                  height: max > 0 ? `${Math.max((v / max) * 100, 1)}%` : '1%',
                  minHeight: '3px',
                  borderRadius: '4px 4px 2px 2px',
                  background: isCur ? STRAVA_ORANGE : hue.fg(0.22),
                }}
              >
                {showLabel && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-1.5em',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '0.75em',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      color: isCur ? '#ff9868' : hue.fg(0.78),
                    }}
                  >
                    {fmt(v)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.55em', marginTop: '0.5em', flexShrink: 0 }}>
        {xLabels.map((label, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              fontSize: '0.7em',
              color: hue.fg(0.35),
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.7em',
          marginTop: '1.15em',
          paddingTop: '1em',
          borderTop: `1px solid ${hue.fg(0.08)}`,
          flexShrink: 0,
        }}
      >
        <Stat value={`${fmt(total)} ${unit}`} label={t('nWeekTotal', { count: VOLUME_WEEKS })} />
        <Stat value={`${fmt(total / VOLUME_WEEKS)} ${unit}`} label={t('weeklyAverage')} />
      </div>
    </div>
  );
}

// ─── Year poster ─────────────────────────────────────────────────────────────

function PosterCell({ value, extra, label }: { value: string; extra?: string; label: string }) {
  const hue = useTheme();
  return (
    <div
      style={{
        background: hue.fg(0.045),
        padding: '1em 1.15em',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '1.55em', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {value}
        {extra && (
          <span
            style={{ fontSize: '0.55em', fontWeight: 600, color: '#ff8a5c', marginLeft: '0.55em' }}
          >
            {extra}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: '0.75em',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: hue.fg(0.55),
          marginTop: '0.15em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function YearPosterView({ rows, units, locale, now, width, height }: ViewProps) {
  const hue = useTheme();
  const { start, end } = periodBounds('year', now);
  const totals = totalsForRange(rows, start, end);
  if (totals.count === 0) return <CenterMessage body={t('noActivities')} />;
  const days = activeDays(rows, start, end);
  const kudos = kudosForRange(rows, start, end);
  const { longest } = streaks(rows, now);
  const elapsedDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
  const pct = Math.round((days / Math.max(elapsedDays, 1)) * 100);
  const distValue =
    units === 'imperial' ? totals.distance / METERS_PER_MILE : totals.distance / 1000;
  const marathons = marathonCount(totals.distance);
  const everests = everestCount(totals.elevation);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        fontSize: `${typeScale(width, height, 560, 500, 1.7)}em`,
      }}
    >
      <div style={{ margin: '0.4em 0 0.3em' }}>
        <div style={{ fontSize: '4em', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {formatNumber(distValue, locale)}{' '}
          <span style={{ fontSize: '0.43em', fontWeight: 700, color: hue.fg(0.55) }}>
            {units === 'imperial' ? 'mi' : 'km'}
          </span>
        </div>
        {marathons !== null && (
          <div style={{ fontSize: '0.85em', color: hue.fg(0.55), marginTop: '0.5em' }}>
            {t('marathonEquiv', { count: marathons })}
          </div>
        )}
      </div>
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: hue.fg(0.08),
          border: `1px solid ${hue.fg(0.08)}`,
          borderRadius: '0.85em',
          overflow: 'hidden',
          marginTop: '1.4em',
          alignContent: 'stretch',
        }}
      >
        <PosterCell value={formatDuration(totals.movingTime)} label={t('movingTime')} />
        <PosterCell
          value={formatElevation(totals.elevation, units, locale)}
          extra={everests !== null ? t('everestEquiv', { count: everests }) : undefined}
          label={t('elevation')}
        />
        <PosterCell value={formatNumber(totals.count, locale)} label={t('activities')} />
        <PosterCell
          value={formatNumber(days, locale)}
          extra={t('percentOfDays', { pct })}
          label={t('activeDays')}
        />
        <PosterCell value={formatNumber(kudos, locale)} label={t('kudosTitle')} />
        <PosterCell value={t('daysCount', { count: longest })} label={t('longestStreak')} />
      </div>
    </div>
  );
}

// ─── Records ─────────────────────────────────────────────────────────────────

interface RecordEntry {
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string;
  date: string;
}

function recordEntry(
  icon: React.ReactNode,
  label: string,
  row: ActivityRow,
  value: string,
  locale: string,
): RecordEntry {
  return { icon, label, name: truncate(row.name, 40), value, date: shortDate(row.startDateLocal, locale) };
}

export function RecordsView({ rows, units, locale, width, height, athleteStats }: ViewProps) {
  const hue = useTheme();
  const rec = activityRecords(rows);
  const entries: RecordEntry[] = [];
  // Lifetime bests Strava tracks server-side — deeper history than our
  // 12-month window, so they lead the list when they beat the window.
  if (athleteStats && athleteStats.biggestRideDistance > 0) {
    entries.push({
      icon: <SportIcon type="Ride" size="1.2em" />,
      label: t('biggestRideEver'),
      name: t('allTime'),
      value: formatDistance(athleteStats.biggestRideDistance, units, locale),
      date: '',
    });
  }
  if (athleteStats && athleteStats.biggestClimbElevation > 0) {
    entries.push({
      icon: <MountainIcon size="1.2em" />,
      label: t('biggestClimbEver'),
      name: t('allTime'),
      value: formatElevation(athleteStats.biggestClimbElevation, units, locale),
      date: '',
    });
  }
  if (rec.longestRide) {
    entries.push(
      recordEntry(
        <SportIcon type="Ride" size="1.2em" />,
        t('longestRide'),
        rec.longestRide,
        formatDistance(rec.longestRide.distance, units, locale),
        locale,
      ),
    );
  }
  if (rec.longestRun) {
    entries.push(
      recordEntry(
        <SportIcon type="Run" size="1.2em" />,
        t('longestRun'),
        rec.longestRun,
        formatDistance(rec.longestRun.distance, units, locale),
        locale,
      ),
    );
  }
  if (rec.biggestClimb) {
    entries.push(
      recordEntry(
        <SportIcon type="Hike" size="1.2em" />,
        t('biggestClimb'),
        rec.biggestClimb,
        formatElevation(rec.biggestClimb.elevation, units, locale),
        locale,
      ),
    );
  }
  if (rec.fastestRun) {
    const pace = formatPaceOrSpeed(rec.fastestRun, units, locale);
    if (pace) {
      entries.push(
        recordEntry(
          <ActivityIcon size="1.2em" />,
          t('fastestRunPace'),
          rec.fastestRun,
          pace.value,
          locale,
        ),
      );
    }
  }
  if (rec.topSpeed?.maxSpeed) {
    const speed =
      units === 'imperial'
        ? (rec.topSpeed.maxSpeed * 3600) / METERS_PER_MILE
        : rec.topSpeed.maxSpeed * 3.6;
    entries.push(
      recordEntry(
        <SportIcon type="Ride" size="1.2em" />,
        t('topSpeed'),
        rec.topSpeed,
        `${formatNumber(speed, locale, 1)} ${units === 'imperial' ? 'mph' : 'km/h'}`,
        locale,
      ),
    );
  }
  if (rec.mostKudos && rec.mostKudos.kudosCount > 0) {
    entries.push(
      recordEntry(
        <HeartIcon size="1.2em" />,
        t('mostKudos'),
        rec.mostKudos,
        formatNumber(rec.mostKudos.kudosCount, locale),
        locale,
      ),
    );
  }
  if (entries.length === 0) return <CenterMessage body={t('noActivities')} />;
  // Up to 8 entries now — trim to what the box height actually fits
  const fit = Math.max(3, Math.floor((height - 40) / 66));
  const shown = entries.slice(0, fit);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        overflow: 'hidden',
        fontSize: `${typeScale(width, height, 560, shown.length * 120 + 60, 1.8)}em`,
      }}
    >
      {shown.map((entry, i) => (
        <div
          key={entry.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1em',
            padding: '0.85em 0',
            borderBottom: i < shown.length - 1 ? `1px solid ${hue.fg(0.08)}` : 'none',
          }}
        >
          <div
            style={{
              width: '2.4em',
              height: '2.4em',
              borderRadius: '0.55em',
              background: 'rgba(252,76,2,0.16)',
              color: '#ff8a5c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {entry.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.75em',
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: hue.fg(0.55),
              }}
            >
              {entry.label}
            </div>
            <div
              style={{
                fontSize: '0.9em',
                color: hue.fg(0.78),
                marginTop: '0.15em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {entry.name}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{entry.value}</div>
            <div style={{ fontSize: '0.75em', color: hue.fg(0.35), marginTop: '0.1em' }}>
              {entry.date}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Eddington number ────────────────────────────────────────────────────────

export function EddingtonView({ rows, units, locale, width, height }: ViewProps) {
  const hue = useTheme();
  if (rows.length === 0) return <CenterMessage body={t('noActivities')} />;
  const e = eddington(rows, units);
  const unit = units === 'imperial' ? 'mi' : 'km';
  const next = e.number + 1;
  const nextFraction = next > 0 ? Math.min(1, e.towardNext / next) : 0;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        fontSize: `${typeScale(width, height, 520, 460, 1.9)}em`,
      }}
    >
      <div>
        <div style={{ fontSize: '5em', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {formatNumber(e.number, locale)}
        </div>
        <div style={{ fontSize: '0.9em', color: hue.fg(0.55), marginTop: '0.6em' }}>
          {t('eddingtonMeaning', { count: e.number, unit })}
        </div>
      </div>
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.8em',
            marginBottom: '0.5em',
          }}
        >
          <span style={{ fontWeight: 600, color: hue.fg(0.78) }}>
            {t('eddingtonNext', { next })}
          </span>
          <span style={{ color: hue.fg(0.55) }}>
            {t('eddingtonNeeded', { count: e.neededForNext, next, unit })}
          </span>
        </div>
        <div
          style={{
            height: '0.85em',
            borderRadius: '999px',
            background: hue.fg(0.08),
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(nextFraction * 100)}%`,
              height: '100%',
              borderRadius: '999px',
              background: STRAVA_ORANGE,
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.7em',
          paddingTop: '1em',
          borderTop: `1px solid ${hue.fg(0.08)}`,
        }}
      >
        <Stat
          value={formatNumber(e.towardNext, locale)}
          label={t('eddingtonQualifying', { next, unit })}
        />
        <Stat value={formatNumber(rows.length, locale)} label={t('activities')} />
      </div>
    </div>
  );
}

// ─── Training times ──────────────────────────────────────────────────────────

function BarChart({
  values,
  labels,
  highlight,
}: {
  values: number[];
  labels: string[];
  highlight: number;
}) {
  const hue = useTheme();
  const max = Math.max(...values);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: '0.45em' }}>
        {values.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: max > 0 ? `${Math.max((v / max) * 100, 2)}%` : '2%',
              minHeight: '3px',
              borderRadius: '4px 4px 2px 2px',
              background: i === highlight && v > 0 ? STRAVA_ORANGE : hue.fg(0.22),
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.45em', marginTop: '0.4em', flexShrink: 0 }}>
        {labels.map((label, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              fontSize: '0.7em',
              textAlign: 'center',
              color: i === highlight ? hue.fg(0.78) : hue.fg(0.35),
              fontWeight: i === highlight ? 700 : 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '0.7em',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        opacity: 0.55,
        marginBottom: '0.6em',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

const HOUR_BUCKET = 3; // 24h → 8 bars

export function TrainingTimesView({ rows, locale, now, width, height }: ViewProps) {
  const hue = useTheme();
  if (rows.length === 0) return <CenterMessage body={t('noActivities')} />;
  const byWeekday = weekdayDistribution(rows);
  const byHour = hourDistribution(rows);
  const hourBuckets: TimeBucketTotals[] = Array.from({ length: 24 / HOUR_BUCKET }, (_, b) => {
    const slice = byHour.slice(b * HOUR_BUCKET, (b + 1) * HOUR_BUCKET);
    return {
      count: slice.reduce((s, v) => s + v.count, 0),
      movingTime: slice.reduce((s, v) => s + v.movingTime, 0),
    };
  });

  const monday = startOfIsoWeek(now);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(monday, i));
    } catch {
      return ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i];
    }
  });
  const hourLabel = (b: number): string => {
    const d = new Date(2000, 0, 1, b * HOUR_BUCKET);
    try {
      return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(d);
    } catch {
      return `${b * HOUR_BUCKET}`;
    }
  };

  const weekdayCounts = byWeekday.map((v) => v.count);
  const hourCounts = hourBuckets.map((v) => v.count);
  const topWeekday = weekdayCounts.indexOf(Math.max(...weekdayCounts));
  const topHourBucket = hourCounts.indexOf(Math.max(...hourCounts));
  const topWeekdayName = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
        addDays(monday, topWeekday),
      );
    } catch {
      return weekdayLabels[topWeekday];
    }
  })();

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2em',
        fontSize: `${typeScale(width, height, 560, 500, 1.6)}em`,
      }}
    >
      <div style={{ flex: 1.1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SectionLabel>{t('byWeekday')}</SectionLabel>
        <BarChart values={weekdayCounts} labels={weekdayLabels} highlight={topWeekday} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SectionLabel>{t('byTimeOfDay')}</SectionLabel>
        <BarChart
          values={hourCounts}
          labels={hourBuckets.map((_, b) => hourLabel(b))}
          highlight={topHourBucket}
        />
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.7em',
          paddingTop: '1em',
          borderTop: `1px solid ${hue.fg(0.08)}`,
          flexShrink: 0,
        }}
      >
        <Stat value={topWeekdayName} label={t('favoriteDay')} />
        <Stat value={hourLabel(topHourBucket)} label={t('favoriteTime')} />
      </div>
    </div>
  );
}

// ─── Month calendar ──────────────────────────────────────────────────────────

/** Calendar-cell tiers: an empty day in the host's text color, then the
 *  brand orange deepening with volume. See `tierColors` in views.tsx. */
const calTierBg = (hue: Theme) => [
  hue.fg(0.04),
  'rgba(252,76,2,0.22)',
  'rgba(252,76,2,0.4)',
  'rgba(252,76,2,0.58)',
  'rgba(252,76,2,0.78)',
];

export function MonthCalendarView({ rows, config, units, locale, now, width, height }: ViewProps) {
  const hue = useTheme();
  const tiers = calTierBg(hue);
  const grid = monthCalendarGrid(now);
  const buckets = bucketByDay(rows);
  let max = 0;
  for (const week of grid) {
    for (const cell of week) {
      if (!cell) continue;
      const v = heatmapValue(buckets.get(cell.key), config.heatmapMetric);
      if (v > max) max = v;
    }
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const totals = totalsForRange(rows, monthStart, nextMonth);
  const { current } = streaks(rows, now);
  const monthActiveDays = activeDays(rows, monthStart, nextMonth);

  // Locale weekday letters, Monday first
  const monday = startOfIsoWeek(now);
  const dow = Array.from({ length: 7 }, (_, i) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(monday, i));
    } catch {
      return ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i];
    }
  });

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        fontSize: `${typeScale(width, height, 560, 500, 1.5)}em`,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.4em',
          marginBottom: '0.4em',
          flexShrink: 0,
        }}
      >
        {dow.map((d, i) => (
          <span
            key={i}
            style={{
              fontSize: '0.7em',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: hue.fg(0.35),
              textAlign: 'center',
            }}
          >
            {d}
          </span>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: '1fr',
          gap: '0.4em',
        }}
      >
        {grid.flat().map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} />;
          const v = heatmapValue(buckets.get(cell.key), config.heatmapMetric);
          const tier = cell.isFuture ? 0 : tierFor(v, max);
          return (
            <div
              key={cell.key}
              style={{
                borderRadius: '0.5em',
                background: cell.isFuture ? 'transparent' : tiers[tier],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9em',
                fontWeight: cell.isFuture ? 500 : 600,
                color:
                  tier >= 2
                    ? hue.fg(1)
                    : cell.isFuture
                      ? hue.fg(0.25)
                      : hue.fg(0.55),
                boxShadow: cell.isToday ? `0 0 0 2px ${STRAVA_ORANGE}` : undefined,
              }}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.7em',
          marginTop: '1.15em',
          paddingTop: '1em',
          borderTop: `1px solid ${hue.fg(0.08)}`,
          flexShrink: 0,
        }}
      >
        <Stat value={formatNumber(monthActiveDays, locale)} label={t('activeDays')} />
        <Stat value={t('daysCount', { count: current })} label={t('currentStreak')} />
        <Stat value={formatDistance(totals.distance, units, locale)} label={t('thisMonth')} />
      </div>
    </div>
  );
}
