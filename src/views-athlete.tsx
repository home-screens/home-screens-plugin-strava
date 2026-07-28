/** Athlete-data views: gear mileage, starred-segment PRs, and milestones. */

import React from 'react';
import type { ActivityTotals, GearItem, StarredSegment, Units } from './types';
import { nextMilestone } from './aggregate';
import {
  formatClock,
  formatDistance,
  formatNumber,
  METERS_PER_MILE,
  shortDate,
  truncate,
} from './format';
import { MountainIcon, SportIcon } from './icons';
import { t } from './i18n';
import { typeScale } from './size';
import { CenterMessage, STRAVA_ORANGE, type ViewProps } from './views';
import { useTheme } from './theme';

// ─── Gear ────────────────────────────────────────────────────────────────────

function GearRow({
  item,
  max,
  units,
  locale,
}: {
  item: GearItem;
  max: number;
  units: Units;
  locale: string;
}) {
  const hue = useTheme();
  const fraction = max > 0 ? item.distance / max : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35em' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6em' }}>
        <span
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {truncate(item.name, 36)}
        </span>
        {item.primary && (
          <span
            style={{
              fontSize: '0.6em',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0.2em 0.8em',
              borderRadius: '1em',
              background: 'rgba(252,76,2,0.16)',
              color: '#ff8a5c',
              flexShrink: 0,
            }}
          >
            {t('primaryGear')}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontWeight: 700, flexShrink: 0 }}>
          {formatDistance(item.distance, units, locale)}
        </span>
      </div>
      <div
        style={{
          height: '0.5em',
          borderRadius: '999px',
          background: hue.fg(0.08),
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(2, Math.round(fraction * 100))}%`,
            height: '100%',
            borderRadius: '999px',
            background: STRAVA_ORANGE,
            opacity: 0.45 + 0.55 * fraction,
          }}
        />
      </div>
    </div>
  );
}

function GearSection({
  sport,
  label,
  items,
  units,
  locale,
}: {
  sport: string;
  label: string;
  items: GearItem[];
  units: Units;
  locale: string;
}) {
  if (items.length === 0) return null;
  const max = items[0].distance; // lists arrive sorted most-used first
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85em', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45em',
          color: STRAVA_ORANGE,
          fontWeight: 600,
        }}
      >
        <SportIcon type={sport} size="1em" />
        <span
          style={{
            fontSize: '0.7em',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
      </div>
      {items.map((item) => (
        <GearRow key={item.id || item.name} item={item} max={max} units={units} locale={locale} />
      ))}
    </div>
  );
}

export function GearView({ athlete, units, locale, width, height }: ViewProps) {
  if (!athlete) return <CenterMessage body={t('loading')} />;
  const bikes = athlete.bikes;
  const shoes = athlete.shoes;
  if (bikes.length === 0 && shoes.length === 0) {
    return <CenterMessage body={t('noGear')} />;
  }
  // Cap rows to what the box fits (~52px per row + section headers)
  const budget = Math.max(2, Math.floor((height - 90) / 58));
  const bikesShown = bikes.slice(0, Math.min(bikes.length, Math.ceil(budget / 2)));
  const shoesShown = shoes.slice(0, Math.max(0, budget - bikesShown.length));
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        gap: '1.4em',
        overflow: 'hidden',
        fontSize: `${typeScale(width, height, 520, (bikesShown.length + shoesShown.length) * 70 + 120, 1.7)}em`,
      }}
    >
      <GearSection sport="Ride" label={t('bikes')} items={bikesShown} units={units} locale={locale} />
      <GearSection sport="Run" label={t('shoes')} items={shoesShown} units={units} locale={locale} />
    </div>
  );
}

// ─── Segment PRs ─────────────────────────────────────────────────────────────

/** Strava climb_category is 0–5 with higher = harder: 5 is HC, 4 is Cat 1, … 1 is Cat 4. */
function climbBadge(category: number): string | null {
  if (category <= 0) return null;
  return category >= 5 ? 'HC' : `Cat ${5 - category}`;
}

function SegmentRow({
  segment,
  units,
  locale,
  isLast,
}: {
  segment: StarredSegment;
  units: Units;
  locale: string;
  isLast: boolean;
}) {
  const hue = useTheme();
  const badge = climbBadge(segment.climbCategory);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1em',
        padding: '0.7em 0',
        borderBottom: isLast ? 'none' : `1px solid ${hue.fg(0.08)}`,
      }}
    >
      <div
        style={{
          width: '2.2em',
          height: '2.2em',
          borderRadius: '0.55em',
          background: 'rgba(252,76,2,0.16)',
          color: '#ff8a5c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <MountainIcon size="1.2em" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {truncate(segment.name, 42)}
          {badge && (
            <span
              style={{
                fontSize: '0.65em',
                fontWeight: 700,
                marginLeft: '0.8em',
                padding: '0.15em 0.7em',
                borderRadius: '1em',
                background: hue.fg(0.08),
                color: hue.fg(0.78),
                verticalAlign: 'middle',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75em', opacity: 0.55, marginTop: '0.15em' }}>
          {formatDistance(segment.distance, units, locale)}
          {segment.averageGrade !== 0 &&
            ` · ${formatNumber(segment.averageGrade, locale, 1)}%`}
          {typeof segment.effortCount === 'number' &&
            segment.effortCount > 0 &&
            ` · ${t('attempts', { count: segment.effortCount })}`}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {segment.prTime ? (
          <>
            <div style={{ fontSize: '1.2em', fontWeight: 700 }}>{formatClock(segment.prTime)}</div>
            <div style={{ fontSize: '0.75em', color: hue.fg(0.35), marginTop: '0.1em' }}>
              {segment.prDate ? shortDate(segment.prDate, locale) : t('personalRecord')}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.8em', opacity: 0.4 }}>{t('notAttempted')}</div>
        )}
      </div>
    </div>
  );
}

// ─── Milestones ──────────────────────────────────────────────────────────────

function MilestoneRow({
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
  const hue = useTheme();
  if (!totals || totals.count === 0) return null;
  const unit = units === 'imperial' ? 'mi' : 'km';
  const value = units === 'imperial' ? totals.distance / METERS_PER_MILE : totals.distance / 1000;
  const m = nextMilestone(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45em' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6em' }}>
        <span style={{ color: STRAVA_ORANGE, display: 'flex', alignSelf: 'center' }}>
          <SportIcon type={sport} size="1.1em" />
        </span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1.15em' }}>
          {formatNumber(Math.round(value), locale)} {unit}
        </span>
      </div>
      <div
        style={{
          height: '0.6em',
          borderRadius: '999px',
          background: hue.fg(0.08),
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(2, Math.round(m.fraction * 100))}%`,
            height: '100%',
            borderRadius: '999px',
            background: STRAVA_ORANGE,
          }}
        />
      </div>
      <div style={{ display: 'flex', fontSize: '0.75em', opacity: 0.55 }}>
        <span>{t('activitiesCount', { count: totals.count })}</span>
        <span style={{ marginLeft: 'auto' }}>
          {t('milestoneToGo', {
            remaining: `${formatNumber(Math.ceil(m.remaining), locale)} ${unit}`,
            target: formatNumber(m.target, locale),
          })}
        </span>
      </div>
    </div>
  );
}

export function MilestonesView({ athleteStats, units, locale, width, height }: ViewProps) {
  if (!athleteStats) return <CenterMessage body={t('loading')} />;
  const rows = [
    { sport: 'Ride', label: t('rides'), totals: athleteStats.allRideTotals },
    { sport: 'Run', label: t('runs'), totals: athleteStats.allRunTotals },
    { sport: 'Swim', label: t('swims'), totals: athleteStats.allSwimTotals },
  ].filter((r) => r.totals && r.totals.count > 0);
  if (rows.length === 0) return <CenterMessage body={t('noActivities')} />;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        gap: '1.4em',
        overflow: 'hidden',
        fontSize: `${typeScale(width, height, 520, rows.length * 110 + 80, 1.8)}em`,
      }}
    >
      {rows.map((r) => (
        <MilestoneRow
          key={r.sport}
          sport={r.sport}
          label={r.label}
          totals={r.totals}
          units={units}
          locale={locale}
        />
      ))}
    </div>
  );
}

export function SegmentPrsView({ segments, units, locale, width, height }: ViewProps) {
  if (!segments) return <CenterMessage body={t('loading')} />;
  if (segments.length === 0) return <CenterMessage body={t('noSegments')} />;
  // Most-ridden first; segments never attempted sink to the bottom
  const sorted = [...segments].sort((a, b) => (b.effortCount ?? -1) - (a.effortCount ?? -1));
  const fit = Math.max(2, Math.floor((height - 60) / 74));
  const shown = sorted.slice(0, fit);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        overflow: 'hidden',
        fontSize: `${typeScale(width, height, 560, shown.length * 90 + 50, 1.6)}em`,
      }}
    >
      {shown.map((segment, i) => (
        <SegmentRow
          key={segment.id}
          segment={segment}
          units={units}
          locale={locale}
          isLast={i === shown.length - 1}
        />
      ))}
    </div>
  );
}
