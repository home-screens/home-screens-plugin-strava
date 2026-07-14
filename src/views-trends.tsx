/** Trend views: year-over-year cumulative distance and the fitness/fatigue
 *  training-load chart. Both draw stretch-to-fill SVG lines (preserveAspectRatio
 *  "none" + non-scaling strokes) so the chart always fills its box. */

import React from 'react';
import { cumulativeYear, fitnessSeries } from './aggregate';
import { formatDistance, formatNumber, formatSignedNumber, METERS_PER_MILE } from './format';
import { t } from './i18n';
import { typeScale } from './size';
import { CenterMessage, Stat, STRAVA_ORANGE, type ViewProps } from './views';

const VB_W = 100;
const VB_H = 40;

/** Polyline points for a series stretched across `domain` x-slots. */
function linePoints(series: number[], domain: number, max: number): string {
  if (series.length === 0 || max <= 0) return '';
  const lastX = Math.max(domain - 1, 1);
  return series
    .map((v, i) => `${((i / lastX) * VB_W).toFixed(2)},${(VB_H - (v / max) * (VB_H - 2) - 1).toFixed(2)}`)
    .join(' ');
}

function TrendSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <line
        x1={0}
        y1={VB_H - 1}
        x2={VB_W}
        y2={VB_H - 1}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {children}
    </svg>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
      <span
        style={{
          width: '0.65em',
          height: '0.65em',
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      <span style={{ fontSize: '0.75em', opacity: 0.65 }}>{label}</span>
    </span>
  );
}

// ─── Year vs last year ───────────────────────────────────────────────────────

const LAST_YEAR_COLOR = 'rgba(255,255,255,0.35)';

export function YearCompareView({ rows, units, locale, now, width, height }: ViewProps) {
  if (rows.length === 0) return <CenterMessage body={t('noActivities')} />;
  const year = now.getFullYear();
  const cur = cumulativeYear(rows, year, now);
  const prev = cumulativeYear(rows, year - 1, now);
  const domain = Math.max(prev.length, 365);
  const max = Math.max(cur[cur.length - 1] ?? 0, prev[prev.length - 1] ?? 0);
  if (max <= 0) return <CenterMessage body={t('noActivities')} />;

  const curTotal = cur[cur.length - 1] ?? 0;
  // Same-date comparison: last year's cumulative at today's day-of-year
  const prevAtDate = prev[Math.min(cur.length - 1, prev.length - 1)] ?? 0;
  const deltaMeters = curTotal - prevAtDate;
  const delta =
    units === 'imperial' ? deltaMeters / METERS_PER_MILE : deltaMeters / 1000;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        fontSize: `${typeScale(width, height, 560, 460, 1.6)}em`,
      }}
    >
      <div style={{ display: 'flex', gap: '1.4em', flexShrink: 0, marginBottom: '0.85em' }}>
        <LegendDot color={STRAVA_ORANGE} label={String(year)} />
        <LegendDot color={LAST_YEAR_COLOR} label={String(year - 1)} />
      </div>
      <div style={{ flex: 1, minHeight: '4em' }}>
        <TrendSvg>
          {prev.length > 0 && (
            <polyline
              points={linePoints(prev, domain, max)}
              fill="none"
              stroke={LAST_YEAR_COLOR}
              strokeWidth={1.6}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {cur.length > 0 && (
            <polyline
              points={linePoints(cur, domain, max)}
              fill="none"
              stroke={STRAVA_ORANGE}
              strokeWidth={2.4}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </TrendSvg>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.7em',
          marginTop: '1em',
          paddingTop: '1em',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <Stat value={formatDistance(curTotal, units, locale)} label={String(year)} />
        <Stat value={formatDistance(prevAtDate, units, locale)} label={t('sameDateLastYear')} />
        <Stat
          value={`${formatSignedNumber(delta, locale, 0)} ${units === 'imperial' ? 'mi' : 'km'}`}
          label={t('difference')}
        />
      </div>
    </div>
  );
}

// ─── Fitness trend ───────────────────────────────────────────────────────────

const FITNESS_DAYS = 90;
const FATIGUE_COLOR = 'rgba(255,255,255,0.4)';

export function FitnessView({ rows, locale, now, width, height }: ViewProps) {
  if (rows.length === 0) return <CenterMessage body={t('noActivities')} />;
  const series = fitnessSeries(rows, now, FITNESS_DAYS);
  const max = Math.max(...series.map((p) => Math.max(p.fitness, p.fatigue)));
  if (!(max > 0)) return <CenterMessage body={t('noActivities')} />;
  const last = series[series.length - 1];
  const form = Math.round(last.form);
  const formState = form >= 5 ? t('formFresh') : form <= -10 ? t('formTired') : t('formNeutral');

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        fontSize: `${typeScale(width, height, 560, 460, 1.6)}em`,
      }}
    >
      <div style={{ display: 'flex', gap: '1.4em', flexShrink: 0, marginBottom: '0.85em' }}>
        <LegendDot color={STRAVA_ORANGE} label={t('fitnessLabel')} />
        <LegendDot color={FATIGUE_COLOR} label={t('fatigueLabel')} />
        <span style={{ marginLeft: 'auto', fontSize: '0.75em', opacity: 0.4 }}>
          {t('lastNDays', { count: FITNESS_DAYS })}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: '4em' }}>
        <TrendSvg>
          <polyline
            points={linePoints(series.map((p) => p.fatigue), series.length, max)}
            fill="none"
            stroke={FATIGUE_COLOR}
            strokeWidth={1.4}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={linePoints(series.map((p) => p.fitness), series.length, max)}
            fill="none"
            stroke={STRAVA_ORANGE}
            strokeWidth={2.4}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </TrendSvg>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1.7em',
          marginTop: '1em',
          paddingTop: '1em',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <Stat value={formatNumber(Math.round(last.fitness), locale)} label={t('fitnessLabel')} />
        <Stat value={formatNumber(Math.round(last.fatigue), locale)} label={t('fatigueLabel')} />
        <Stat value={`${formatSignedNumber(form, locale, 0)} · ${formState}`} label={t('formLabel')} />
      </div>
    </div>
  );
}
