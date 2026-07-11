/** Route gallery: recent outdoor routes drawn as line art. */

import React from 'react';
import { decodePolyline, projectPoints } from './polyline';
import { formatDistance, shortDayLabel } from './format';
import { SportIcon } from './icons';
import { t } from './i18n';
import { CenterMessage, STRAVA_ORANGE, type ViewProps } from './views';

const ART_W = 100;
const ART_H = 70;
const MAX_ROUTES = 9;

/** A single route drawn into a 100×70 viewBox with a white start dot. */
export function RouteArt({ polyline, strokeWidth = 2 }: { polyline: string; strokeWidth?: number }) {
  const projected = React.useMemo(
    () => projectPoints(decodePolyline(polyline), ART_W, ART_H),
    [polyline],
  );
  if (projected.length < 2) return null;
  const path = projected
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join('');
  return (
    <svg
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%' }}
    >
      <path
        d={path}
        fill="none"
        stroke={STRAVA_ORANGE}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      <circle cx={projected[0].x} cy={projected[0].y} r={2.5} fill="#fff" />
    </svg>
  );
}

export function RouteGalleryView({ rows, units, locale, now }: ViewProps) {
  const routed = rows.filter((r) => r.polyline).slice(0, MAX_ROUTES);
  if (routed.length === 0) return <CenterMessage body={t('noRoutes')} />;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(19em, 1fr))',
        gridAutoRows: '1fr',
        gap: '0.85em',
        overflow: 'hidden',
      }}
    >
      {routed.map((a) => (
        <div
          key={a.id}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '0.85em',
            padding: '0.85em',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55em',
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: '4em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RouteArt polyline={a.polyline!} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexShrink: 0 }}>
            <span style={{ opacity: 0.55, display: 'flex' }}>
              <SportIcon type={a.type} size="0.95em" />
            </span>
            <span style={{ fontSize: '1.05em', fontWeight: 700 }}>
              {formatDistance(a.distance, units, locale)}
            </span>
            <span style={{ fontSize: '0.75em', opacity: 0.4, marginLeft: 'auto' }}>
              {shortDayLabel(a.startDateLocal, locale, now, t('today'))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
