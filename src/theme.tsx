// Module-wide color, derived from the host's Text color.
//
// Why this exists: the host hands the module `style.textColor` and expects
// the module to use it. Every neutral in these views used to be a literal
// `rgba(255, 255, 255, α)` — a white rail, a white-tinted card, a dimmed
// white label. That is correct for the shipped look (light text on a dark
// module) and invisible for the opposite one: a user who picks a dark Text
// color for a light background gets white cards and white hairlines on
// white, with no way to fix it from the style panel.
//
// Two primitives cover the whole surface:
//
//   fg(α)     the host's text color at an alpha. Body text, dim labels,
//             hairline borders, and the faint washes the cards are built
//             from. At the default `#ffffff` it reproduces the old literals
//             exactly, which is why the shipped look is unchanged.
//   shade(α)  the surface side — black behind light text, white behind dark
//             text. For anything that sits *under* body text and has to
//             stay darker (or lighter) than it: scrims, and the heatmap's
//             empty-state pill.
//
// What is NOT derived: Strava's brand orange and the semantic green. Orange
// is the product's identity rather than a neutral, and green means "personal
// record" — both survive a theme change and stay literals.

import React from 'react';
// Color parsing lives in host-style.ts, which owns the same problem for the
// module frame. Re-exported here so the theme's own tests and callers have
// one import, not because there are two implementations.
import { parseColor, resolveColor } from './host-style';

export { parseColor, resolveColor };

/** Perceived brightness, 0–1 (Rec. 601 luma — cheap and good enough to
 *  answer "is this light or dark?"). */
export function luminance(rgb: [number, number, number]): number {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

export interface Theme {
  /** True when the module paints light text on a dark surface — the shipped
   *  look, and what the brand colors below are tuned for. */
  dark: boolean;
  /** The host's text color at an alpha. */
  fg: (alpha?: number) => string;
  /** The surface side, opposite the text. Scrims and washes. */
  shade: (alpha: number) => string;
}

export function makeTheme(textColor: string): Theme {
  // White is the last resort, for a value even the browser rejects. Anything
  // it can read is resolved first, so a dark Text color really does produce
  // dark neutrals rather than white-on-pale.
  const resolvedText = resolveColor(textColor);
  const rgb = (resolvedText !== null ? parseColor(resolvedText) : null) ?? [255, 255, 255];
  const dark = luminance(rgb) >= 0.5;

  const fg = (alpha = 1): string => (
    alpha >= 1
      ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
      : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
  );
  const shade = (alpha: number): string => (
    dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`
  );

  return { dark, fg, shade };
}

/** The shipped look: white text on a dark surface. The context default, so
 *  anything rendered outside a provider keeps it. */
export const DEFAULT_THEME = makeTheme('#ffffff');

const ThemeContext = React.createContext<Theme>(DEFAULT_THEME);

export function ThemeProvider({ textColor, children }: {
  textColor: string; children: React.ReactNode;
}) {
  const theme = React.useMemo(() => makeTheme(textColor), [textColor]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return React.useContext(ThemeContext);
}
