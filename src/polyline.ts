/** Google encoded-polyline decoding and SVG path fitting for route maps. */

export type LatLng = [number, number];

/**
 * Decode a Google encoded polyline. Truncated input (a chunk or the second
 * half of a lat/lng pair cut off mid-stream) drops the incomplete point
 * instead of emitting a phantom (0,0) segment.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;

  function decodeChunk(): number | null {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= encoded.length) return null; // truncated chunk — bail
      b = encoded.charCodeAt(i++) - 63;
      if (b < 0) return null; // invalid character
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  while (i < encoded.length) {
    const dLat = decodeChunk();
    if (dLat === null) break;
    const dLng = decodeChunk();
    if (dLng === null) break; // lat without lng — drop the half point
    lat += dLat;
    lng += dLng;
    points.push([lat * 1e-5, lng * 1e-5]);
  }
  return points;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * Fit decoded points into a width×height box: 5% padding, cos(midLat)
 * longitude compensation so routes keep their real aspect ratio, and a
 * Y-flip (latitude grows up, SVG y grows down).
 *
 * Returns [] for fewer than 2 points — callers hide the map area instead of
 * rendering a dot (treadmill/indoor activities have no polyline at all).
 */
export function projectPoints(points: LatLng[], width: number, height: number): ProjectedPoint[] {
  if (points.length < 2) return [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const midLat = (minLat + maxLat) / 2;
  const lngComp = Math.cos((midLat * Math.PI) / 180);
  const spanX = (maxLng - minLng) * lngComp || 1e-9;
  const spanY = maxLat - minLat || 1e-9;

  const pad = 0.05;
  const innerW = width * (1 - 2 * pad);
  const innerH = height * (1 - 2 * pad);
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return points.map(([lat, lng]) => ({
    x: offsetX + (lng - minLng) * lngComp * scale,
    y: offsetY + (maxLat - lat) * scale,
  }));
}

/**
 * Width/height aspect of the route's bounding box (longitude compensated).
 * Lets callers pick an SVG canvas matching the route so it isn't letterboxed
 * twice (route→canvas, then canvas→layout box). Returns 1 for degenerate
 * input.
 */
export function routeAspect(points: LatLng[]): number {
  if (points.length < 2) return 1;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const midLat = (minLat + maxLat) / 2;
  const spanX = (maxLng - minLng) * Math.cos((midLat * Math.PI) / 180);
  const spanY = maxLat - minLat;
  if (!(spanX > 0) || !(spanY > 0)) return 1;
  return spanX / spanY;
}

/** SVG path through the projected points; '' when there is nothing to draw. */
export function polylineToPath(points: LatLng[], width: number, height: number): string {
  const projected = projectPoints(points, width, height);
  return projected
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join('');
}

// ─── Multi-route overlay (all routes on one shared canvas) ──────────────────

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function boundsOf(routes: LatLng[][]): Bounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const route of routes) {
    for (const [lat, lng] of route) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (!Number.isFinite(minLat)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * One far-flung activity (a race trip, a vacation ride) would shrink every
 * local route to a dot, so the overlay keeps only the densest cluster:
 * routes whose start lies within `radiusKm` of the median start point.
 */
export function dominantCluster(routes: LatLng[][], radiusKm = 120): LatLng[][] {
  const startable = routes.filter((r) => r.length >= 2);
  if (startable.length <= 1) return startable;
  const median = (values: number[]): number => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const midLat = median(startable.map((r) => r[0][0]));
  const midLng = median(startable.map((r) => r[0][1]));
  const kmPerDegLng = 111.32 * Math.cos((midLat * Math.PI) / 180);
  return startable.filter(([start]) => {
    const dLat = (start[0] - midLat) * 111.32;
    const dLng = (start[1] - midLng) * kmPerDegLng;
    return Math.hypot(dLat, dLng) <= radiusKm;
  });
}

/** Width/height aspect of the combined bounding box of all routes. */
export function overlayAspect(routes: LatLng[][]): number {
  const b = boundsOf(routes);
  if (!b) return 1;
  const spanX = (b.maxLng - b.minLng) * Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  const spanY = b.maxLat - b.minLat;
  if (!(spanX > 0) || !(spanY > 0)) return 1;
  return spanX / spanY;
}

/**
 * Project every route into one shared width×height canvas (global bounds,
 * same padding/compensation rules as projectPoints) and return one SVG path
 * per route. Routes with fewer than 2 points are dropped.
 */
export function overlayPaths(routes: LatLng[][], width: number, height: number): string[] {
  const drawable = routes.filter((r) => r.length >= 2);
  const b = boundsOf(drawable);
  if (!b) return [];
  const midLat = (b.minLat + b.maxLat) / 2;
  const lngComp = Math.cos((midLat * Math.PI) / 180);
  const spanX = (b.maxLng - b.minLng) * lngComp || 1e-9;
  const spanY = b.maxLat - b.minLat || 1e-9;
  const pad = 0.05;
  const scale = Math.min((width * (1 - 2 * pad)) / spanX, (height * (1 - 2 * pad)) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return drawable.map((route) =>
    route
      .map(([lat, lng], idx) => {
        const x = offsetX + (lng - b.minLng) * lngComp * scale;
        const y = offsetY + (b.maxLat - lat) * scale;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(''),
  );
}
