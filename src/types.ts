/** Shared types for the Strava plugin. */

export type StravaView =
  | 'dashboard'
  | 'stats-tiles'
  | 'recent-activities'
  | 'route-gallery'
  | 'training-volume'
  | 'goal-progress'
  | 'heatmap'
  | 'month-calendar'
  | 'year-poster'
  | 'records'
  | 'latest-hero'
  | 'athlete-card';

export type GoalMetric = 'distance' | 'movingTime' | 'elevation';
export type GoalPeriod = 'week' | 'year';

export interface StravaGoal {
  metric: GoalMetric;
  period: GoalPeriod;
  /** Natural units: distance in km/mi, movingTime in hours, elevation in m/ft. */
  target: number;
}

export type UnitsSetting = 'auto' | 'metric' | 'imperial';
export type Units = 'metric' | 'imperial';

export type HeatmapMetric = 'count' | 'distance' | 'movingTime';

export interface StravaConfig {
  view: StravaView;
  activityFilter: string;
  recentLimit: number;
  goals: StravaGoal[];
  units: UnitsSetting;
  heatmapMetric: HeatmapMetric;
  volumeMetric: 'distance' | 'movingTime';
  showMap: boolean;
  showHeader: boolean;
}

/** Compact activity row mapped from a Strava SummaryActivity. */
export interface ActivityRow {
  id: number;
  name: string;
  /** Strava sport_type, e.g. "Run", "TrailRun", "VirtualRide", "Padel". */
  type: string;
  /** UTC instant, ISO string — for relative-time display. */
  startDate: string;
  /** Athlete-local wall time, ISO string — for day/week/year bucketing. */
  startDateLocal: string;
  /** Meters */
  distance: number;
  /** Seconds */
  movingTime: number;
  /** Seconds */
  elapsedTime: number;
  /** Meters */
  elevation: number;
  /** Meters/second */
  avgSpeed: number;
  avgHr?: number;
  avgWatts?: number;
  kudosCount: number;
  prCount: number;
  achievementCount: number;
  /** Google encoded polyline (summary resolution); absent for indoor activities. */
  polyline?: string;
  deviceName?: string;
}

export interface AthleteProfile {
  id: number;
  firstName: string;
  lastName: string;
  /** Profile photo URL; may be Strava's "avatar/athlete/large.png" placeholder. */
  profile?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface ActivityTotals {
  count: number;
  /** Meters */
  distance: number;
  /** Seconds */
  movingTime: number;
  /** Meters */
  elevation: number;
}

export interface AthleteStats {
  allRideTotals: ActivityTotals;
  allRunTotals: ActivityTotals;
  allSwimTotals: ActivityTotals;
}
