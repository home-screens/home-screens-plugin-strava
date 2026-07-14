/**
 * Strava plugin for Home Screens.
 *
 * Entry point: normalizes config, gates on the host auth adapter's
 * connection status, owns the data lifecycle (activities or athlete+stats,
 * refetched every 10 minutes to match the proxy cache TTL), and routes to a
 * view. All auth mechanics — token storage, refresh, injection — live in the
 * host; this component only ever calls pluginFetch and getAuthStatus.
 */

import React from 'react';
import type { ModuleStyle, PluginComponentProps } from './hs-plugin';
import type {
  ActivityRow,
  AthleteProfile,
  AthleteStats,
  StravaConfig,
  StravaGoal,
  StravaView,
  Units,
} from './types';
import { fetchActivities, fetchAthlete, fetchAthleteStats, isAuthError, PLUGIN_ID } from './api';
import { filterActivities, sortNewestFirst } from './aggregate';
import { relativeTime } from './format';
import { currentLocale, t } from './i18n';
import { useModuleSize } from './size';
import { ActivityIcon } from './icons';
import {
  AthleteCardView,
  CenterMessage,
  GoalProgressView,
  HeatmapView,
  LatestHeroView,
  RecentActivitiesView,
  StatsTilesView,
  STRAVA_ORANGE,
  type ViewProps,
} from './views';
import { DashboardView } from './views-dashboard';
import { RouteGalleryView } from './views-gallery';
import {
  MonthCalendarView,
  RecordsView,
  TrainingVolumeView,
  volumeUnit,
  YearPosterView,
} from './views-insights';

const REFRESH_MS = 600_000;
const AUTH_RECHECK_MS = 60_000;

const VALID_VIEWS = new Set<string>([
  'dashboard',
  'stats-tiles',
  'recent-activities',
  'route-gallery',
  'training-volume',
  'goal-progress',
  'heatmap',
  'month-calendar',
  'year-poster',
  'records',
  'latest-hero',
  'athlete-card',
]);
const METRICS = new Set(['distance', 'movingTime', 'elevation']);
const PERIODS = new Set(['week', 'year']);
const HEATMAP_METRICS = new Set(['count', 'distance', 'movingTime']);

function normalizeGoals(raw: unknown): StravaGoal[] {
  if (!Array.isArray(raw)) return [];
  const goals: StravaGoal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    const target = typeof g.target === 'number' && g.target > 0 ? g.target : 0;
    if (!target) continue;
    goals.push({
      metric: METRICS.has(g.metric as string) ? (g.metric as StravaGoal['metric']) : 'distance',
      period: PERIODS.has(g.period as string) ? (g.period as StravaGoal['period']) : 'week',
      target,
    });
  }
  return goals;
}

function normalizeConfig(raw: Record<string, unknown>): StravaConfig {
  const view = VALID_VIEWS.has(raw.view as string) ? (raw.view as StravaView) : 'stats-tiles';
  const recentLimit =
    typeof raw.recentLimit === 'number'
      ? Math.max(1, Math.min(10, Math.round(raw.recentLimit)))
      : 5;
  const units =
    raw.units === 'metric' || raw.units === 'imperial' ? raw.units : ('auto' as const);
  return {
    view,
    activityFilter: typeof raw.activityFilter === 'string' ? raw.activityFilter : 'all',
    recentLimit,
    goals: normalizeGoals(raw.goals),
    units,
    heatmapMetric: HEATMAP_METRICS.has(raw.heatmapMetric as string)
      ? (raw.heatmapMetric as StravaConfig['heatmapMetric'])
      : 'count',
    volumeMetric: raw.volumeMetric === 'movingTime' ? 'movingTime' : 'distance',
    showMap: raw.showMap !== false,
    showHeader: raw.showHeader !== false,
  };
}

function resolveUnits(setting: StravaConfig['units']): Units {
  if (setting === 'metric' || setting === 'imperial') return setting;
  try {
    return window.__HS_SDK__?.getHostSettings().units === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

function RootFrame({
  style,
  rootRef,
  children,
}: {
  style: ModuleStyle;
  rootRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={rootRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        color: style.textColor,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        padding: style.padding,
        opacity: style.opacity,
        backdropFilter: `blur(${style.backdropBlur ?? 0}px)`,
        WebkitBackdropFilter: `blur(${style.backdropBlur ?? 0}px)`,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

export function Header({ label, right }: { label: string; right?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em',
        marginBottom: '0.8em',
        flexShrink: 0,
      }}
    >
      <span style={{ color: STRAVA_ORANGE, display: 'flex' }}>
        <ActivityIcon size="1.1em" />
      </span>
      <span
        style={{
          fontSize: '0.8em',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          opacity: 0.8,
        }}
      >
        {label}
      </span>
      {right && (
        <span style={{ marginLeft: 'auto', fontSize: '0.8em', opacity: 0.4 }}>{right}</span>
      )}
    </div>
  );
}

/** Header label per view; month/year views get a dynamic title. */
export function headerLabel(view: StravaView, locale: string, now: Date): string {
  if (view === 'month-calendar') {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
    } catch {
      return t('views.month-calendar');
    }
  }
  if (view === 'year-poster') return t('yearSoFar', { year: String(now.getFullYear()) });
  if (view === 'records') return t('recordsTitle');
  return t(`views.${view}`);
}

type AuthState = 'checking' | 'connected' | 'disconnected';

export default function StravaPlugin({ config: rawConfig, style }: PluginComponentProps) {
  const configKey = JSON.stringify(rawConfig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const config = React.useMemo(() => normalizeConfig(rawConfig), [configKey]);

  const [auth, setAuth] = React.useState<AuthState>('checking');
  const [rows, setRows] = React.useState<ActivityRow[] | null>(null);
  const [athlete, setAthlete] = React.useState<AthleteProfile | null>(null);
  const [athleteStats, setAthleteStats] = React.useState<AthleteStats | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [now, setNow] = React.useState(() => new Date());
  const { ref: rootRef, tier, width, height } = useModuleSize();
  // Set when a 401/403 flipped us to disconnected: the adapter may still
  // report "connected" (tokens exist but are rejected upstream), so delay the
  // next status check instead of re-entering a fetch/401 loop.
  const cooldownAfter401 = React.useRef(false);

  // Minute tick so relative times and period boundaries stay current
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Poll the auth adapter until connected; a 401 mid-run flips us back here.
  React.useEffect(() => {
    if (auth === 'connected') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      const sdk = window.__HS_SDK__;
      // Host too old to expose auth status — let the fetches decide.
      if (!sdk?.getAuthStatus) {
        if (!cancelled) setAuth('connected');
        return;
      }
      let connected = false;
      try {
        connected = (await sdk.getAuthStatus(PLUGIN_ID)).connected;
      } catch {
        connected = false;
      }
      if (cancelled) return;
      if (connected) {
        setAuth('connected');
      } else {
        setAuth('disconnected');
        timer = setTimeout(check, AUTH_RECHECK_MS);
      }
    }
    if (cooldownAfter401.current) {
      cooldownAfter401.current = false;
      timer = setTimeout(check, AUTH_RECHECK_MS);
    } else {
      check();
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auth]);

  // Data lifecycle. Transient failures keep the last good data; only the
  // "nothing loaded yet" state surfaces an error message.
  const needsAthlete = config.view === 'athlete-card';
  React.useEffect(() => {
    if (auth !== 'connected') return;
    let cancelled = false;
    async function load() {
      try {
        if (needsAthlete) {
          const profile = await fetchAthlete();
          if (cancelled) return;
          setAthlete(profile);
          try {
            const stats = await fetchAthleteStats(profile.id);
            if (!cancelled) setAthleteStats(stats);
          } catch (err) {
            // Keep the last good lifetime totals rather than blanking
            if (isAuthError(err)) throw err;
          }
        } else {
          const activities = await fetchActivities();
          if (!cancelled) setRows(activities);
        }
        if (!cancelled) {
          setFailed(false);
          setUpdatedAt(new Date());
        }
      } catch (err) {
        if (cancelled) return;
        if (isAuthError(err)) {
          cooldownAfter401.current = true;
          setAuth('disconnected');
          return;
        }
        setFailed(true);
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [auth, needsAthlete]);

  const locale = currentLocale();
  const units = resolveUnits(config.units);
  const filtered = React.useMemo(
    () => (rows ? sortNewestFirst(filterActivities(rows, config.activityFilter)) : null),
    [rows, config.activityFilter],
  );

  let body: React.ReactNode;
  if (auth === 'disconnected') {
    body = <CenterMessage title={t('connectTitle')} body={t('connectBody')} />;
  } else if (auth === 'checking' || (needsAthlete ? !athlete : !filtered)) {
    body = <CenterMessage body={failed ? t('error') : t('loading')} />;
  } else {
    const viewProps: ViewProps = {
      rows: filtered ?? [],
      config,
      units,
      locale,
      now,
      athlete,
      athleteStats,
      updatedAt,
      tier,
      width,
      height,
    };
    switch (config.view) {
      case 'dashboard':
        body = <DashboardView {...viewProps} />;
        break;
      case 'recent-activities':
        body = <RecentActivitiesView {...viewProps} />;
        break;
      case 'route-gallery':
        body = <RouteGalleryView {...viewProps} />;
        break;
      case 'training-volume':
        body = <TrainingVolumeView {...viewProps} />;
        break;
      case 'goal-progress':
        body = <GoalProgressView {...viewProps} />;
        break;
      case 'heatmap':
        body = <HeatmapView {...viewProps} />;
        break;
      case 'month-calendar':
        body = <MonthCalendarView {...viewProps} />;
        break;
      case 'year-poster':
        body = <YearPosterView {...viewProps} />;
        break;
      case 'records':
        body = <RecordsView {...viewProps} />;
        break;
      case 'latest-hero':
        body = <LatestHeroView {...viewProps} />;
        break;
      case 'athlete-card':
        body = <AthleteCardView {...viewProps} />;
        break;
      default:
        body = <StatsTilesView {...viewProps} />;
    }
  }

  let headerRight: string | undefined;
  if (config.view === 'dashboard' && updatedAt && auth === 'connected') {
    headerRight = t('updated', {
      when: relativeTime(updatedAt.toISOString(), locale, now, t('justNow')),
    });
  } else if (config.view === 'training-volume') {
    headerRight = t('perWeek', { unit: volumeUnit(config.volumeMetric, units) });
  }

  return (
    <RootFrame style={style} rootRef={rootRef}>
      {config.showHeader && <Header label={headerLabel(config.view, locale, now)} right={headerRight} />}
      {body}
    </RootFrame>
  );
}
