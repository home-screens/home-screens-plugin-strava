/** Size awareness: the module root is measured with a ResizeObserver and
 *  bucketed into discrete layout tiers so views can adapt without reading
 *  raw pixels everywhere. Mirrors the Garmin plugin's size system. */

import React from 'react';

export type SizeTier = 'compact' | 'medium' | 'large';

/** Bucket a measured module box into a discrete layout tier (spec-fixed
 *  boundaries). Width is passed for future density decisions but tiering is
 *  height-driven. */
export function tierFor(width: number, height: number): SizeTier {
  void width;
  if (height < 500) return 'compact';
  if (height < 900) return 'medium';
  return 'large';
}

/** A short, wide box reads better as two side-by-side panes than as a
 *  vertical stack with stretched rows. */
export function isWide(width: number, height: number): boolean {
  return width >= 640 && width >= height * 1.9;
}

/** Vertical rhythm scaled to the box height: tight in small modules, airy in
 *  tall ones, so small modules pack instead of clipping. */
export function stackGap(height: number): number {
  return Math.max(16, Math.min(36, Math.round(height * 0.055)));
}

/** Em multiplier that grows a view's type into large boxes: the ratio of the
 *  measured box to the view's natural size at the host font, clamped so text
 *  never shrinks below the host size and never balloons past `max`. */
export function typeScale(
  width: number,
  height: number,
  naturalW: number,
  naturalH: number,
  max: number,
): number {
  const s = Math.min(width / naturalW, height / naturalH);
  return Math.max(1, Math.min(s, max));
}

export interface ModuleSize {
  tier: SizeTier;
  width: number;
  height: number;
}

/** ResizeObserver on the module root, bucketed through tierFor so views see
 *  three discrete layout states. Falls back to 'medium' when ResizeObserver
 *  is unavailable (jsdom/tests — kiosk Chromium always has it). */
export function useModuleSize(): { ref: React.RefObject<HTMLDivElement | null> } & ModuleSize {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<ModuleSize>({ tier: 'medium', width: 520, height: 640 });

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = (w: number, h: number) =>
      setSize((prev) => {
        const next = { tier: tierFor(w, h), width: Math.round(w), height: Math.round(h) };
        return prev.tier === next.tier && prev.width === next.width && prev.height === next.height
          ? prev
          : next;
      });
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, tier: size.tier, width: size.width, height: size.height };
}
