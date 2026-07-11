import { describe, expect, it } from 'vitest';
import { decodePolyline, polylineToPath } from './polyline';

// Google's canonical example: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453)
const CANONICAL = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

describe('decodePolyline', () => {
  it('decodes the canonical Google example', () => {
    const pts = decodePolyline(CANONICAL);
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(38.5, 5);
    expect(pts[0][1]).toBeCloseTo(-120.2, 5);
    expect(pts[2][0]).toBeCloseTo(43.252, 5);
    expect(pts[2][1]).toBeCloseTo(-126.453, 5);
  });
  it('returns empty for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
  it('bails on truncated input instead of emitting a phantom point', () => {
    const truncated = CANONICAL.slice(0, CANONICAL.length - 2);
    const pts = decodePolyline(truncated);
    expect(pts.length).toBeLessThanOrEqual(2);
    for (const [lat, lng] of pts) {
      expect(Math.abs(lat) + Math.abs(lng)).toBeGreaterThan(1); // no (0,0)
    }
  });
});

describe('polylineToPath', () => {
  it('returns an SVG path fitted into the box', () => {
    const path = polylineToPath(decodePolyline(CANONICAL), 100, 60);
    expect(path.startsWith('M')).toBe(true);
    expect(path).toContain('L');
    // Every coordinate stays inside the box
    const coords = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < coords.length; i += 2) {
      expect(coords[i]).toBeGreaterThanOrEqual(0);
      expect(coords[i]).toBeLessThanOrEqual(100);
      expect(coords[i + 1]).toBeGreaterThanOrEqual(0);
      expect(coords[i + 1]).toBeLessThanOrEqual(60);
    }
  });
  it('flips Y so north is up', () => {
    // Two points: south then north — the northern point must have smaller y
    const path = polylineToPath(
      [
        [38, -120],
        [39, -120],
      ],
      100,
      60,
    );
    const [, y1, , y2] = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(y2).toBeLessThan(y1);
  });
  it('returns empty for fewer than 2 points so callers hide the map', () => {
    expect(polylineToPath([], 100, 60)).toBe('');
    expect(polylineToPath([[38.5, -120.2]], 100, 60)).toBe('');
  });
});
