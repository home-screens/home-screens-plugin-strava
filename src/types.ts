/** Shared types for the Strava plugin. */

export type StravaView =
  | 'dashboard'
  | 'stats-tiles'
  | 'recent-activities'
  | 'route-gallery'
  | 'route-map'
  | 'training-volume'
  | 'goal-progress'
  | 'heatmap'
  | 'month-calendar'
  | 'year-poster'
  | 'year-compare'
  | 'fitness'
  | 'records'
  | 'eddington'
  | 'training-times'
  | 'segment-prs'
  | 'gear'
  | 'planned-routes'
  | 'photos'
  | 'milestones'
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
  /** Drop activities flagged as commutes from every view and total. */
  excludeCommutes: boolean;
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
  /** Meters/second */
  maxSpeed?: number;
  maxHr?: number;
  /** Strava relative effort (subscriber accounts) */
  sufferScore?: number;
  /** True for runs tagged 1 and rides tagged 11 ("race") in workout_type. */
  isRace: boolean;
  commute: boolean;
  trainer: boolean;
  /** Athletes on the activity; >1 means a group activity. */
  athleteCount?: number;
  photoCount: number;
  kudosCount: number;
  prCount: number;
  achievementCount: number;
  /** Google encoded polyline (summary resolution); absent for indoor activities. */
  polyline?: string;
  deviceName?: string;
}

/** Extras only present on a DetailedActivity (one fetch per activity). */
export interface ActivityDetail {
  id: number;
  calories?: number;
  description?: string;
  /** CDN URL of the primary photo (~600px). */
  photoUrl?: string;
  /** Name of the bike/shoes used. */
  gearName?: string;
  deviceName?: string;
}

export interface GearItem {
  id: string;
  name: string;
  primary: boolean;
  /** Lifetime meters logged on this gear. */
  distance: number;
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
  followerCount?: number;
  /** Kilograms, as entered on Strava. */
  weight?: number;
  ftp?: number;
  bikes: GearItem[];
  shoes: GearItem[];
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
  /** This calendar year. */
  ytdRideTotals: ActivityTotals;
  ytdRunTotals: ActivityTotals;
  ytdSwimTotals: ActivityTotals;
  /** Last 4 weeks. */
  recentRideTotals: ActivityTotals;
  recentRunTotals: ActivityTotals;
  recentSwimTotals: ActivityTotals;
  /** Meters; lifetime records Strava tracks server-side. */
  biggestRideDistance: number;
  biggestClimbElevation: number;
}

/** A saved route the athlete created (from GET /athletes/{id}/routes). */
export interface PlannedRoute {
  id: string;
  name: string;
  /** Meters */
  distance: number;
  /** Meters */
  elevationGain: number;
  /** Seconds, Strava's estimate. */
  estimatedTime?: number;
  /** Google encoded polyline (summary resolution). */
  polyline?: string;
}

/** One photo on the wall: the primary photo of a photo-bearing activity. */
export interface PhotoItem {
  activityId: number;
  url: string;
  name: string;
  startDateLocal: string;
}

/** A starred segment with the athlete's PR on it (from GET /segments/starred). */
export interface StarredSegment {
  id: number;
  name: string;
  activityType: string;
  /** Meters */
  distance: number;
  /** Percent */
  averageGrade: number;
  /** 0 (flat) to 5 (hors catégorie) */
  climbCategory: number;
  city?: string;
  /** Athlete's PR elapsed time in seconds; absent when never ridden. */
  prTime?: number;
  /** ISO date of the PR effort. */
  prDate?: string;
  /** Athlete's total attempts on the segment. */
  effortCount?: number;
}
