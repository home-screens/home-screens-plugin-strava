/**
 * Translation helper. Prefers the host's translate() (which registered this
 * plugin's dictionary from the manifest `translations` map under the
 * `plugin:strava` namespace and walks the locale fallback chain). Falls back
 * to the bundled English dictionary when the host is older or the lookup
 * misses, so the display never shows raw keys.
 */

import en from '../translations/en-US.json';
import { prettySportType } from './format';

const NAMESPACE = 'plugin:strava';

type Vars = Record<string, string | number>;

function lookup(dict: unknown, path: string[]): unknown {
  let node: unknown = dict;
  for (const part of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export function t(key: string, vars?: Vars): string {
  const sdk = typeof window !== 'undefined' ? window.__HS_SDK__ : undefined;
  if (sdk?.translate) {
    const full = `${NAMESPACE}.${key}`;
    const res = sdk.translate(full, vars);
    if (res !== full) return res;
  }
  const node = lookup(en, key.split('.'));
  if (typeof node === 'string') return interpolate(node, vars);
  if (node && typeof node === 'object' && vars && typeof vars.count === 'number') {
    const forms = node as Record<string, string>;
    const form = vars.count === 1 ? (forms.one ?? forms.other) : forms.other;
    if (typeof form === 'string') return interpolate(form, vars);
  }
  return key;
}

export function currentLocale(): string {
  const sdk = typeof window !== 'undefined' ? window.__HS_SDK__ : undefined;
  return sdk?.locale || 'en-US';
}

/** Translated sport name; unknown/new sport types fall back to a prettified raw name. */
export function sportLabel(type: string): string {
  const key = `sport.${type}`;
  const res = t(key);
  return res === key ? prettySportType(type) : res;
}
