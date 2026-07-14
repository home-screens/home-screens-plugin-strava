/** Route gallery: recent outdoor routes drawn as line art. */

import React from 'react';
import { decodePolyline, projectPoints, routeAspect } from './polyline';
import { formatDistance, shortDayLabel } from './format';
import { SportIcon } from './icons';
import { t } from './i18n';
import { CenterMessage, STRAVA_ORANGE, type ViewProps } from './views';

const ART_W = 100;
const MAX_ROUTES = 9;

/** A single route drawn at its own aspect ratio with a white start dot, so
 *  the art fills its box instead of floating in a fixed landscape canvas. */
export function RouteArt({ polyline, strokeWidth = 2 }: { polyline: string; strokeWidth?: number }) {
  const { projected, artH } = React.useMemo(() => {
    const pts = decodePolyline(polyline);
    const h = Math.round(ART_W / Math.max(0.5, Math.min(routeAspect(pts), 2.2)));
    return { projected: projectPoints(pts, ART_W, h), artH: h };
  }, [polyline]);
  if (projected.length < 2) return null;
  const path = projected
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join('');
  return (
    <svg
      viewBox={`0 0 ${ART_W} ${artH}`}
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

// Grid geometry at the 16px base font, used to cap the card count to what
// the measured box actually fits (a fixed 9 overflows small modules).
const GAP_PX = 13.6; // 0.85em
const MIN_COL_PX = 304; // 19em, matches the grid's minmax track
const MIN_CARD_H_PX = 130; // padding + min art height + footer
const HEADER_ALLOWANCE_PX = 48;

export function RouteGalleryView({ rows, units, locale, now, width, height }: ViewProps) {
  const cols = Math.max(1, Math.floor((width + GAP_PX) / (MIN_COL_PX + GAP_PX)));
  const fitRows = Math.max(
    1,
    Math.floor((height - HEADER_ALLOWANCE_PX + GAP_PX) / (MIN_CARD_H_PX + GAP_PX)),
  );
  // Round down to full rows so the grid never ends with a dangling card
  const capped = Math.min(MAX_ROUTES, cols * fitRows);
  const count = Math.max(cols, Math.floor(capped / cols) * cols);
  const routed = rows.filter((r) => r.polyline).slice(0, count);
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
