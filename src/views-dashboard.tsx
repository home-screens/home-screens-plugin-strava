/**
 * Dashboard: latest activity with route thumb, this-week day strip, and the
 * first configured goal as a ring — or week-over-week deltas when no goal is
 * set.
 */

import React from 'react';
import { bucketByDay, goalProgress, totalsForRange, totalsForPeriod } from './aggregate';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatPaceOrSpeed,
  formatSignedNumber,
  METERS_PER_MILE,
  relativeTime,
  truncate,
} from './format';
import { addDays, dayKey, periodBounds, startOfIsoWeek } from './date-ranges';
import { typeScale } from './size';
import { SportIcon } from './icons';
import { sportLabel, t } from './i18n';
import { RouteArt } from './views-gallery';
import {
  CenterMessage,
  GoalRing,
  goalValue,
  OnTrackBadge,
  periodLabel,
  Stat,
  STRAVA_ORANGE,
  type ViewProps,
} from './views';

function Chip({ children, orange }: { children: React.ReactNode; orange?: boolean }) {
  return (
    <span
      style={{
        fontSize: '0.75em',
        fontWeight: 600,
        padding: '0.25em 0.85em',
        borderRadius: '999px',
        background: orange ? 'rgba(252,76,2,0.16)' : 'rgba(255,255,255,0.05)',
        border: orange ? '1px solid transparent' : '1px solid rgba(255,255,255,0.08)',
        color: orange ? '#ff8a5c' : 'rgba(255,255,255,0.78)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function DashboardView(props: ViewProps) {
  const { rows, config, units, locale, now, width, height } = props;
  const latest = rows[0];
  if (!latest) return <CenterMessage body={t('noActivities')} />;

  // Small boxes: no room for the route thumb or the goal/delta side pane;
  // short boxes additionally drop the chips row and tighten the rhythm.
  const compact = width < 440;
  const short = height < 480;

  const pace = formatPaceOrSpeed(latest, units, locale);
  const week = totalsForPeriod(rows, 'week', now);

  // Per-day distance for the Mon–Sun strip
  const monday = startOfIsoWeek(now);
  const buckets = bucketByDay(rows);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      value: buckets.get(dayKey(date))?.distance ?? 0,
      isToday: dayKey(date) === dayKey(now),
      letter: (() => {
        try {
          return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date);
        } catch {
          return ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i];
        }
      })(),
    };
  });
  const maxDay = Math.max(...days.map((d) => d.value));

  const goal = config.goals[0];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        // Dense view: scale gently, the week strip absorbs the rest
        fontSize: `${typeScale(width, height, 680, 480, 1.35)}em`,
      }}
    >
      {/* ── latest activity hero ── */}
      <div style={{ display: 'flex', gap: '1.4em', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
            <span style={{ color: STRAVA_ORANGE, display: 'flex', flexShrink: 0 }}>
              <SportIcon type={latest.type} size="1.8em" />
            </span>
            <div
              style={{
                fontSize: '1.7em',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {truncate(latest.name, 60)}
            </div>
          </div>
          <div
            style={{
              fontSize: '0.9em',
              color: 'rgba(255,255,255,0.55)',
              margin: '0.3em 0 1.1em 3.35em',
            }}
          >
            {sportLabel(latest.type)} · {relativeTime(latest.startDate, locale, now, t('justNow'))}
            {latest.deviceName ? ` · ${latest.deviceName}` : ''}
          </div>
          <div
            style={{
              display: 'flex',
              gap: compact ? '1em 2.3em' : '2.3em',
              marginLeft: '3.35em',
              flexWrap: 'wrap',
            }}
          >
            {latest.distance > 0 && (
              <Stat value={formatDistance(latest.distance, units, locale)} label={t('distance')} />
            )}
            <Stat value={formatDuration(latest.movingTime)} label={t('time')} />
            {pace && latest.distance > 0 && (
              <Stat value={pace.value} label={pace.kind === 'pace' ? t('pace') : t('speed')} />
            )}
            {latest.elevation > 0 && (
              <Stat
                value={formatElevation(latest.elevation, units, locale)}
                label={t('elevation')}
              />
            )}
          </div>
          {!short && (
            <div style={{ display: 'flex', gap: '0.55em', margin: '1.1em 0 0 3.35em' }}>
              {latest.prCount > 0 && <Chip orange>{t('prCount', { count: latest.prCount })}</Chip>}
              <Chip>
                {formatNumber(latest.kudosCount, locale)} {t('kudos')}
              </Chip>
            </div>
          )}
        </div>
        {!compact && config.showMap && latest.polyline && (
          <div
            style={{
              width: '14.3em',
              alignSelf: 'stretch',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.85em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.55em',
            }}
          >
            <RouteArt polyline={latest.polyline} />
          </div>
        )}
      </div>

      <div
        style={{
          height: '1px',
          background: 'rgba(255,255,255,0.08)',
          margin: short ? '0.9em 0' : '1.4em 0',
        }}
      />

      {/* ── this week + goal/delta pane ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '1.4em' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.8em',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            {t('thisWeek')}
          </span>
          <div
            style={{
              flex: 1,
              minHeight: '3.5em',
              // An empty week has no bars worth a tall chart — collapse it
              maxHeight: maxDay > 0 ? '15em' : '3.5em',
              display: 'flex',
              gap: '1.15em',
              alignItems: 'flex-end',
              marginTop: '0.85em',
            }}
          >
            {days.map((d, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.4em',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: '2.15em',
                    height: d.value > 0 && maxDay > 0 ? `${Math.max((d.value / maxDay) * 100, 4)}%` : '3px',
                    borderRadius: d.value > 0 ? '4px 4px 2px 2px' : '2px',
                    background:
                      d.value <= 0
                        ? 'rgba(255,255,255,0.12)'
                        : d.isToday
                          ? STRAVA_ORANGE
                          : 'rgba(255,255,255,0.22)',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.75em',
                    fontWeight: 600,
                    color: d.isToday ? '#fff' : 'rgba(255,255,255,0.35)',
                  }}
                >
                  {d.letter}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1.7em', marginTop: '1em', flexShrink: 0 }}>
            <Stat value={formatDistance(week.distance, units, locale)} label={t('distance')} />
            <Stat value={formatDuration(week.movingTime)} label={t('time')} />
            <Stat value={formatNumber(week.count, locale)} label={t('activities')} />
            {week.elevation > 0 && (
              <Stat value={formatElevation(week.elevation, units, locale)} label={t('elevation')} />
            )}
          </div>
        </div>

        {!compact && (
          <div
            style={{
              width: '15em',
              flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              paddingLeft: '1.4em',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.55em',
            }}
          >
            {goal ? <GoalPane {...props} /> : <DeltaPane {...props} />}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalPane({ rows, config, units, locale, now }: ViewProps) {
  const goal = config.goals[0];
  const p = goalProgress(rows, goal, units, now);
  return (
    <>
      <GoalRing fraction={p.fraction} label={`${Math.round(p.fraction * 100)}%`} size="8.3em" />
      <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
        {goalValue(goal.metric, p.current, units, locale)} /{' '}
        {goalValue(goal.metric, p.target, units, locale)} · {periodLabel(goal.period)}
      </div>
      {p.onTrack !== null && <OnTrackBadge onTrack={p.onTrack} />}
    </>
  );
}

function DeltaPane({ rows, units, locale, now }: ViewProps) {
  const { start } = periodBounds('week', now);
  const thisWeek = totalsForRange(rows, start, addDays(start, 7));
  const lastWeek = totalsForRange(rows, addDays(start, -7), start);
  const distDelta =
    (thisWeek.distance - lastWeek.distance) / (units === 'imperial' ? METERS_PER_MILE : 1000);
  const timeDelta = thisWeek.movingTime - lastWeek.movingTime;
  const timeSign = timeDelta < 0 ? '−' : '+';
  const rowsOut: [string, string][] = [
    [t('distance'), `${formatSignedNumber(distDelta, locale)} ${units === 'imperial' ? 'mi' : 'km'}`],
    [t('time'), `${timeSign}${formatDuration(Math.abs(timeDelta))}`],
    [t('activities'), formatSignedNumber(thisWeek.count - lastWeek.count, locale, 0)],
  ];
  return (
    <>
      <span
        style={{
          fontSize: '0.8em',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        {t('vsLastWeek')}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55em', width: '100%' }}>
        {rowsOut.map(([label, value]) => (
          <div
            key={label}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <span style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
            <span style={{ fontSize: '1.15em', fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
