// Demand-driven state provider — the plugin's single shared-state publisher.
//
// The host mounts exactly one instance of this component (manifest
// `exports.stateProvider`), alive for the whole display tab regardless of
// screen rotation, and hands it `demandedKeys`: every key of this plugin's
// namespace referenced by any visibility condition, rule, or Text-module
// token on the display. Referencing a key IS what makes it publish — no
// need to keep a Strava module instance on screen.
//
// The auth-poll state machine below is a deliberate copy of index.tsx's
// (not a shared hook — none exists in this repo): same cooldown-after-401
// behavior, so a provider fetch failure can't spin into a fetch/401 loop.

import React from 'react';
import type { StateProviderProps } from './hs-plugin';
import type { ProviderHealthStatus } from './hs-sdk';
import type { ActivityRow, Units } from './types';
import { fetchActivities, isAuthError, PLUGIN_ID } from './api';
import { sortNewestFirst, streaks, eddington, daysSinceLastActivity } from './aggregate';
import { dayKeyFromIso } from './date-ranges';

/** Matches the visible module's own refresh cadence, so provider and any
 *  open module land in the same proxy cache TTL bucket. */
export const REFRESH_MS = 600_000;
const AUTH_RECHECK_MS = 60_000;

export const PROVIDED_KEYS = [
  'last_activity_type',
  'last_activity_date',
  'current_streak',
  'days_since_last_activity',
  'eddington_number',
] as const;

const KNOWN_KEYS = new Set<string>(PROVIDED_KEYS);

/** The subset of demanded keys this provider can act on. Unknown keys
 *  (typos, another plugin's namespace) are simply never published.
 *  Exported for tests. */
export function selectPublishableKeys(demandedKeys: readonly string[]): string[] {
  return demandedKeys.filter((k) => KNOWN_KEYS.has(k));
}

/** Map fetched activity rows to the string values to publish, restricted to
 *  the demanded subset. A key with nothing meaningful to say yet (no
 *  activities at all) is simply absent, never published as a placeholder.
 *  Exported for tests. */
export function planValues(
  rows: ActivityRow[],
  keys: readonly string[],
  now: Date,
  units: Units,
): Record<string, string> {
  const want = (k: string) => keys.includes(k);
  const out: Record<string, string> = {};
  const latest = rows.length > 0 ? sortNewestFirst(rows)[0] : null;

  if (latest && want('last_activity_type')) out.last_activity_type = latest.type;
  if (latest && want('last_activity_date')) out.last_activity_date = dayKeyFromIso(latest.startDateLocal);
  if (want('current_streak')) out.current_streak = String(streaks(rows, now).current);
  if (want('days_since_last_activity')) {
    const days = daysSinceLastActivity(rows, now);
    if (days !== null) out.days_since_last_activity = String(days);
  }
  if (want('eddington_number')) out.eddington_number = String(eddington(rows, units).number);

  return out;
}

/** Keys to clear: previously published but no longer in the demanded set.
 *  Also used for "connection gone" (called with an empty demanded set).
 *  Exported for tests. */
export function planClears(published: ReadonlySet<string>, demandedKeys: readonly string[]): string[] {
  const demanded = new Set(demandedKeys);
  return Array.from(published).filter((k) => !demanded.has(k));
}

type HealthOutage = { since: number };
type HealthOutcome = { ok: true } | { ok: false; message: string; at: number };

/** Decide what (if anything) to report to the host from one poll outcome,
 *  given the outage carried from the previous poll — edge-triggered so a
 *  10-minute poll doesn't spam the inspector every tick while unhealthy.
 *  Exported for tests. */
export function planHealthReport(
  prevOutage: HealthOutage | null,
  outcome: HealthOutcome,
): { report: ProviderHealthStatus | null; outage: HealthOutage | null } {
  if (outcome.ok) {
    if (prevOutage === null) return { report: null, outage: null };
    return { report: { ok: true }, outage: null };
  }
  if (prevOutage !== null) return { report: null, outage: prevOutage };
  return { report: { ok: false, message: outcome.message, since: outcome.at }, outage: { since: outcome.at } };
}

function resolveUnits(): Units {
  try {
    return window.__HS_SDK__?.getHostSettings().units === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

type AuthState = 'checking' | 'connected' | 'disconnected';

export function StateProvider({ demandedKeys }: StateProviderProps) {
  const keys = React.useMemo(() => selectPublishableKeys(demandedKeys), [demandedKeys]);

  const [auth, setAuth] = React.useState<AuthState>('checking');
  // Set when a 401/403 flipped us to disconnected: the adapter may still
  // report "connected" (tokens exist but are rejected upstream), so delay
  // the next status check instead of re-entering a fetch/401 loop.
  const cooldownAfter401 = React.useRef(false);
  const publishedRef = React.useRef<Set<string>>(new Set());
  const outageRef = React.useRef<HealthOutage | null>(null);

  const reportHealth = React.useCallback((outcome: HealthOutcome) => {
    const { report, outage } = planHealthReport(outageRef.current, outcome);
    outageRef.current = outage;
    if (report) window.__HS_SDK__?.reportProviderHealth?.(PLUGIN_ID, report);
  }, []);

  const publish = React.useCallback((key: string, value: string) => {
    window.__HS_SDK__?.publishState?.(PLUGIN_ID, key, value);
    publishedRef.current.add(key);
  }, []);

  const clear = React.useCallback((key: string) => {
    window.__HS_SDK__?.clearState?.(PLUGIN_ID, key);
    publishedRef.current.delete(key);
  }, []);

  // Poll the auth adapter until connected; a 401 mid-fetch flips us back
  // here. Mirrors index.tsx's own auth-poll effect exactly.
  React.useEffect(() => {
    if (auth === 'connected') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      const sdk = window.__HS_SDK__;
      if (!sdk?.getAuthStatus) {
        if (!cancelled) setAuth('connected');
        return;
      }
      let connected = false;
      try {
        connected = (await sdk.getAuthStatus(PLUGIN_ID)).connected;
      } catch {
        connected = false;
      }
      if (cancelled) return;
      if (connected) {
        setAuth('connected');
      } else {
        setAuth('disconnected');
        timer = setTimeout(check, AUTH_RECHECK_MS);
      }
    }
    if (cooldownAfter401.current) {
      cooldownAfter401.current = false;
      timer = setTimeout(check, AUTH_RECHECK_MS);
    } else {
      check();
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auth]);

  // Disconnected: any previously published value is now unverifiable.
  React.useEffect(() => {
    if (auth === 'disconnected') {
      for (const key of planClears(publishedRef.current, [])) clear(key);
      outageRef.current = null;
    }
  }, [auth, clear]);

  // Demand shrink: clear keys that dropped out of the demand set.
  React.useEffect(() => {
    for (const key of planClears(publishedRef.current, keys)) clear(key);
  }, [keys, clear]);

  // Poll loop. Restarts (with an immediate tick) whenever the demand set or
  // connection state changes, so a newly referenced key publishes within
  // one poll of being added.
  React.useEffect(() => {
    if (auth !== 'connected' || keys.length === 0) return;
    let cancelled = false;
    let inflight = false;

    async function tick() {
      if (inflight || cancelled) return;
      inflight = true;
      try {
        const rows = await fetchActivities(new Date());
        if (cancelled) return;
        reportHealth({ ok: true });
        const values = planValues(rows, keys, new Date(), resolveUnits());
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(values, key)) publish(key, values[key]);
          else if (publishedRef.current.has(key)) clear(key);
        }
      } catch (err) {
        if (cancelled) return;
        if (isAuthError(err)) {
          cooldownAfter401.current = true;
          setAuth('disconnected');
          return;
        }
        // Transient failure: keep last-published values, only report unhealthy.
        reportHealth({ ok: false, message: "Can't reach Strava", at: Date.now() });
      } finally {
        inflight = false;
      }
    }

    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [auth, keys, publish, clear, reportHealth]);

  return null;
}
