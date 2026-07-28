// Guards the module frame contract. Every assertion here corresponds to a
// slider in the host's Style panel that this plugin used to ignore.

import { describe, it, expect } from 'vitest';
import {
  hostFrameStyle, colorWithAlpha, moduleShadow, parseColor, parseRgba,
  resolveFontStack, scalePx,
} from './host-style';
import type { HostModuleStyle } from './host-style';

const BASE: HostModuleStyle = {
  fontSize: 16,
  fontFamily: 'inter',
  textColor: '#ffffff',
  backgroundColor: '#000000',
  borderRadius: 12,
  padding: 16,
  opacity: 1,
  backdropBlur: 0,
};

describe('hostFrameStyle', () => {
  it('carries the plain style fields through to the root', () => {
    const s = hostFrameStyle(BASE);
    expect(s.fontSize).toBe(16);
    expect(s.color).toBe('#ffffff');
    expect(s.borderRadius).toBe(12);
    expect(s.padding).toBe(16);
    expect(s.backgroundColor).toBe('#000000');
  });

  it('draws a border only once borderWidth is above zero', () => {
    expect(hostFrameStyle(BASE).border).toBeUndefined();
    expect(hostFrameStyle({ ...BASE, borderWidth: 0 }).border).toBeUndefined();
    expect(hostFrameStyle({ ...BASE, borderWidth: 2 }).border)
      .toBe('2px solid rgba(255, 255, 255, 0.15)');
  });

  it('uses the configured border color when one is set', () => {
    expect(hostFrameStyle({ ...BASE, borderWidth: 1, borderColor: '#ff0000' }).border)
      .toBe('1px solid #ff0000');
  });

  it('draws a shadow only once shadowSize is above zero', () => {
    expect(hostFrameStyle(BASE).boxShadow).toBeUndefined();
    expect(hostFrameStyle({ ...BASE, shadowSize: 24 }).boxShadow)
      .toContain('0 12px 24px rgba(0, 0, 0, 0.8)');
  });

  // The interaction that made this a shared helper: opacity on the element
  // hides the blur entirely, so it has to move into the background's alpha.
  describe('opacity under backdrop blur', () => {
    it('stays on the element when there is no blur', () => {
      const s = hostFrameStyle({ ...BASE, opacity: 0.5 });
      expect(s.opacity).toBe(0.5);
      expect(s.backgroundColor).toBe('#000000');
      expect(s.backdropFilter).toBeUndefined();
    });

    it('bakes into the background alpha when blur is on', () => {
      const s = hostFrameStyle({ ...BASE, opacity: 0.5, backdropBlur: 8 });
      expect(s.opacity).toBeUndefined();
      expect(s.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(s.backdropFilter).toBe('blur(8px)');
      expect(s.WebkitBackdropFilter).toBe('blur(8px)');
    });

    it('scales an already-translucent background rather than making it opaque', () => {
      const s = hostFrameStyle({
        ...BASE, backgroundColor: 'rgba(0, 0, 0, 0.4)', opacity: 0.5, backdropBlur: 8,
      });
      expect(s.backgroundColor).toBe('rgba(0, 0, 0, 0.2)');
    });

    it('falls back to element opacity when the background cannot be read', () => {
      // No DOM to probe in this environment, so an unparseable color has no
      // alpha to bake into — a weaker blur beats a dead opacity slider.
      const s = hostFrameStyle({
        ...BASE, backgroundColor: 'not-a-color', opacity: 0.5, backdropBlur: 8,
      });
      expect(s.opacity).toBe(0.5);
      expect(s.backgroundColor).toBe('not-a-color');
    });
  });

  // The scale variable behind `scalePx`, for pixel dimensions that can't be
  // `em` — column widths shared across two type sizes, or values living in a
  // plain constant style object where no hook can reach.
  describe('the --u scale variable', () => {
    const u = (s: HostModuleStyle, opts?: { baseFontSize?: number }) =>
      (hostFrameStyle(s, opts) as Record<string, unknown>)['--u'];

    it('is 1 at the authored size, so the shipped look is unchanged', () => {
      expect(u({ ...BASE, fontSize: 16 })).toBe(1);
    });

    it('tracks the host Text size', () => {
      expect(u({ ...BASE, fontSize: 32 })).toBe(2);
      expect(u({ ...BASE, fontSize: 8 })).toBe(0.5);
    });

    it('measures against the plugin authored base when one is given', () => {
      expect(u({ ...BASE, fontSize: 14 }, { baseFontSize: 14 })).toBe(1);
      expect(u({ ...BASE, fontSize: 28 }, { baseFontSize: 14 })).toBe(2);
    });

    it('falls back to 1 rather than collapsing every scaled dimension', () => {
      expect(u({ ...BASE, fontSize: 0 })).toBe(1);
      expect(u({ ...BASE, fontSize: Number.NaN })).toBe(1);
      expect(u({ ...BASE, fontSize: -8 })).toBe(1);
      expect(u({ ...BASE, fontSize: undefined as unknown as number })).toBe(1);
    });

    it('also repairs the root font size, not just the variable', () => {
      expect(hostFrameStyle({ ...BASE, fontSize: 0 }).fontSize).toBe(16);
    });
  });

  describe('scalePx', () => {
    it('emits a calc against the variable, defaulting to unscaled', () => {
      expect(scalePx(18)).toBe('calc(18px * var(--u, 1))');
    });
  });

  // The host stores a font ID and resolves it in its own wrapper. A plugin
  // that emits the ID verbatim renders in the browser default while every
  // module beside it renders Inter.
  describe('font family', () => {
    it('resolves the host font ID to a real CSS stack', () => {
      expect(hostFrameStyle(BASE).fontFamily)
        .toBe('var(--font-inter), system-ui, sans-serif');
      expect(hostFrameStyle({ ...BASE, fontFamily: 'playfair' }).fontFamily)
        .toBe('var(--font-playfair), Georgia, serif');
    });

    it('upgrades the raw stacks older configs stored', () => {
      expect(resolveFontStack('Inter, system-ui, sans-serif'))
        .toBe('var(--font-inter), system-ui, sans-serif');
      expect(resolveFontStack('monospace')).toBe('ui-monospace, "SF Mono", Menlo, monospace');
    });

    it('passes through anything the table does not know', () => {
      // A font the host adds after this plugin ships should still render.
      expect(resolveFontStack('Helvetica Neue, sans-serif')).toBe('Helvetica Neue, sans-serif');
      expect(resolveFontStack('')).toBeUndefined();
      expect(resolveFontStack(undefined)).toBeUndefined();
    });
  });
});

describe('parseColor', () => {
  it('reads the forms the host stores', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#1e3a5f')).toEqual([30, 58, 95]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
  });

  it('returns null rather than guessing', () => {
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
  });
});

describe('parseRgba', () => {
  it('reads the alpha the host picker lets a user type', () => {
    // Every one of these is a valid CSS color the picker stores verbatim.
    expect(parseRgba('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(parseRgba('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5]);
    expect(parseRgba('rgba(10 20 30 / 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(parseRgba('rgba(10, 20, 30, 50%)')).toEqual([10, 20, 30, 0.5]);
    expect(parseRgba('#0000ff80')).toEqual([0, 0, 255, 128 / 255]);
    expect(parseRgba('#00f8')).toEqual([0, 0, 255, 136 / 255]);
  });

  it('defaults to fully opaque when no alpha is given', () => {
    expect(parseRgba('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseRgba('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
  });

  it('reads percentage channels as percentages, not as 0-255', () => {
    expect(parseRgba('rgb(100%, 0%, 50%)')).toEqual([255, 0, 128, 1]);
  });

  it('refuses a partial read rather than dropping what it cannot parse', () => {
    expect(parseRgba('hsl(0 0% 10%)')).toBeNull();
    expect(parseRgba('rebeccapurple')).toBeNull();
    expect(parseRgba('#12345')).toBeNull();
    expect(parseRgba('rgb(1, 2)')).toBeNull();
    expect(parseRgba('rgba(1, 2, 3, 4, 5)')).toBeNull();
    expect(parseRgba('rgba(1, 2, 3, 2)')).toBeNull();
    expect(parseRgba('rgb(300, 0, 0)')).toBeNull();
  });
});

describe('colorWithAlpha', () => {
  it('is a no-op at full opacity', () => {
    expect(colorWithAlpha('#abcdef', 1)).toBe('#abcdef');
  });

  it('scales an alpha written in any form the picker accepts', () => {
    // The bug this guards: reading only the comma form silently treated
    // these as opaque, so a blurred module came out twice as solid as set.
    expect(colorWithAlpha('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
    expect(colorWithAlpha('rgb(0 0 0 / 50%)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
    expect(colorWithAlpha('rgba(0, 0, 0, 50%)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
    expect(colorWithAlpha('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('returns null for a color it cannot read, so callers can fall back', () => {
    expect(colorWithAlpha('not-a-color', 0.5)).toBeNull();
  });
});

describe('moduleShadow', () => {
  it('is absent at zero and below', () => {
    expect(moduleShadow(0)).toBeUndefined();
    expect(moduleShadow(-1)).toBeUndefined();
  });

  it('matches the host shape: highlight, cast shadow, ambient ring', () => {
    const shadow = moduleShadow(16) ?? '';
    expect(shadow).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.12)');
    expect(shadow).toContain('0 8px 16px rgba(0, 0, 0, 0.8)');
    expect(shadow).toContain('0 0 8px rgba(255, 255, 255, 0.04)');
  });
});
