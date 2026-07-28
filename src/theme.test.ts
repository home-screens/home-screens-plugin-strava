/**
 * Proves the host's Text color reaches the module's neutrals.
 *
 * Before theme.tsx, every rail, card wash, and dim label in these views was a
 * literal `rgba(255,255,255,α)`. That is right for the shipped look — light
 * text on a dark module — and invisible for the opposite one: pick a dark
 * Text color for a light background and you got white cards and white
 * hairlines on white, unfixable from the style panel.
 */

import { describe, it, expect } from 'vitest';
import { makeTheme, parseColor, luminance, DEFAULT_THEME } from './theme';

describe('makeTheme', () => {
  it('reproduces the shipped literals exactly at the default text color', () => {
    // The whole point of the default: no visual change for anyone who never
    // touches the Text color.
    const th = makeTheme('#ffffff');
    expect(th.fg(0.08)).toBe('rgba(255,255,255,0.08)');
    expect(th.fg(0.55)).toBe('rgba(255,255,255,0.55)');
    expect(th.fg(1)).toBe('rgb(255,255,255)');
    expect(th.dark).toBe(true);
  });

  it('follows a dark text color instead of staying white', () => {
    const th = makeTheme('#111111');
    expect(th.fg(0.08)).toBe('rgba(17,17,17,0.08)');
    expect(th.dark).toBe(false);
  });

  it('flips the surface side with the text side', () => {
    // Scrims sit behind text, so they go the other way.
    expect(makeTheme('#ffffff').shade(0.5)).toBe('rgba(0,0,0,0.5)');
    expect(makeTheme('#111111').shade(0.5)).toBe('rgba(255,255,255,0.5)');
  });

  it('reads every color form the host picker can store', () => {
    expect(makeTheme('#abc').fg(1)).toBe('rgb(170,187,204)');
    expect(makeTheme('rgb(1, 2, 3)').fg(1)).toBe('rgb(1,2,3)');
    expect(makeTheme('rgba(1, 2, 3, 0.5)').fg(1)).toBe('rgb(1,2,3)');
  });

  it('falls back to white rather than rendering a broken color string', () => {
    // No DOM here to resolve a named color, so this is the fallback path.
    expect(makeTheme('not-a-color').fg(1)).toBe('rgb(255,255,255)');
    expect(makeTheme('').fg(1)).toBe('rgb(255,255,255)');
  });

  it('exposes the shipped look as the context default', () => {
    expect(DEFAULT_THEME.fg(1)).toBe('rgb(255,255,255)');
    expect(DEFAULT_THEME.dark).toBe(true);
  });
});

describe('luminance decides which way the module reads', () => {
  it.each([
    ['#ffffff', true],
    ['#e5e5e5', true],
    ['#808080', true],
    ['#404040', false],
    ['#000000', false],
  ])('%s → dark surface: %s', (color, expected) => {
    expect(makeTheme(color).dark).toBe(expected);
  });
});

describe('parseColor', () => {
  it('returns null rather than guessing', () => {
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  it('reads shorthand and full hex alike', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#FC4C02')).toEqual([252, 76, 2]);
  });
});

describe('luminance', () => {
  it('is 0 at black and 1 at white', () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 255, 255])).toBe(1);
  });
});
