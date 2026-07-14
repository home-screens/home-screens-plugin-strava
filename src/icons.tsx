/**
 * Inline stroke icons for sport types, keyed by case-insensitive substring so
 * new Strava sports (Padel, Dance, Physical Therapy, …) land on a sensible
 * family or the generic pulse fallback.
 */

import React from 'react';

interface IconProps {
  size?: string | number;
}

function Svg({ size = '1.25em', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Svg>
  );
}

function BikeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </Svg>
  );
}

function RunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="M13.5 7.5 11.5 12l3 2.5-1.5 5" />
      <path d="M11.5 12 8.5 16.5" />
      <path d="M13.5 8.5 17.5 10" />
      <path d="M13.5 8.5 9.5 9.5" />
    </Svg>
  );
}

function WalkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12.5" cy="4.5" r="1.8" />
      <path d="M12.5 7.5 12 12.5l2 3v4" />
      <path d="M12 12.5 10 16l-.5 3.5" />
      <path d="M12.5 8.5 15 11" />
      <path d="M12.5 8.5 10 11" />
    </Svg>
  );
}

function WavesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 7c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0 3.3-1.5 5 0 3.3 1.5 5 0" />
      <path d="M2 12.5c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0 3.3-1.5 5 0 3.3 1.5 5 0" />
      <path d="M2 18c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0 3.3-1.5 5 0 3.3 1.5 5 0" />
    </Svg>
  );
}

export function MountainIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m8 3 4 8 5-5 5 15H2L8 3Z" />
    </Svg>
  );
}

function SnowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v18" />
      <path d="M5.2 6.75 18.8 17.25" />
      <path d="M18.8 6.75 5.2 17.25" />
    </Svg>
  );
}

function PaddleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20 17 7" />
      <path d="M15.5 4.5c1.5-1.5 4-2 5-1s.5 3.5-1 5-3.5 1.5-4.5.5-1-3 .5-4.5Z" />
    </Svg>
  );
}

function BarbellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9v6" />
      <path d="M7 7v10" />
      <path d="M17 7v10" />
      <path d="M20 9v6" />
      <path d="M7 12h10" />
    </Svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9Z" />
    </Svg>
  );
}

function BallIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M4 8.5c5 2.7 11 2.7 16 0" />
      <path d="M4 15.5c5-2.7 11-2.7 16 0" />
    </Svg>
  );
}

const FAMILIES: [string[], (props: IconProps) => React.ReactElement][] = [
  [['ride', 'bike', 'velomobile', 'handcycle', 'wheelchair'], BikeIcon],
  [['run'], RunIcon],
  [['swim'], WavesIcon],
  [['walk', 'elliptical', 'stairstepper'], WalkIcon],
  [['hike', 'rockclimb', 'snowshoe'], MountainIcon],
  [['ski', 'snowboard', 'iceskate'], SnowIcon],
  [['row', 'kayak', 'canoe', 'paddle', 'surf', 'sail'], PaddleIcon],
  [['weight', 'crossfit', 'workout', 'hiit'], BarbellIcon],
  [['golf', 'tennis', 'soccer', 'basketball', 'pickleball', 'padel', 'racquet', 'squash', 'badminton', 'volleyball', 'cricket'], BallIcon],
];

export function SportIcon({ type, size }: { type: string; size?: string | number }) {
  const t = type.toLowerCase();
  for (const [keys, Icon] of FAMILIES) {
    if (keys.some((k) => t.includes(k))) return <Icon size={size} />;
  }
  return <ActivityIcon size={size} />;
}
