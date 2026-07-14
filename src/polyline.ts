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
