// @vitest-environment jsdom
/**
 * Component render tests for StateProvider: mount it with a stubbed
 * __HS_SDK__ and observe the actual publishState/clearState calls it makes.
 * Pure planning logic (selectPublishableKeys, planValues, planClears,
 * planHealthReport) is covered in state-provider.test.ts; this file exists
 * to catch wiring bugs — effect dependency arrays, timer setup — that pure
 * function tests can't see.
 */
import { afterEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StateProvider } from './state-provider';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function rawRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: 'Lakefront Loop',
    sport_type: 'Run',
    start_date: '2025-06-05T12:00:00Z',
    start_date_local: '2025-06-05T07:00:00Z',
    distance: 10000,
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 42,
    average_speed: 10000 / 3600,
    kudos_count: 7,
    pr_count: 2,
    achievement_count: 2,
    ...overrides,
  };
}

function stubSdk(overrides: Record<string, unknown> = {}) {
  const published: Array<{ key: string; value: string }> = [];
  const cleared: string[] = [];
  (window as unknown as Record<string, unknown>).__HS_SDK__ = {
    getAuthStatus: async () => ({ connected: true }),
    pluginFetch: async () => jsonResponse([rawRun()]),
    getHostSettings: () => ({ units: 'metric', timezone: 'UTC' }),
    publishState: (_pluginId: string, key: string, value: string) => published.push({ key, value }),
    clearState: (_pluginId: string, key: string) => cleared.push(key),
    ...overrides,
  };
  return { published, cleared };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(demandedKeys: string[]) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StateProvider demandedKeys={demandedKeys} settings={{}} />);
  });
  // Let the auth check → connected → fetch → publish chain settle; each hop
  // is a separate promise resolution followed by a state update.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function rerender(demandedKeys: string[]) {
  await act(async () => {
    root!.render(<StateProvider demandedKeys={demandedKeys} settings={{}} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  delete (window as unknown as Record<string, unknown>).__HS_SDK__;
});

describe('StateProvider', () => {
  it('publishes the demanded keys once connected and fetched', async () => {
    const { published } = stubSdk();
    await mount(['last_activity_type', 'current_streak']);
    expect(published).toContainEqual({ key: 'last_activity_type', value: 'Run' });
    expect(published.some((p) => p.key === 'current_streak')).toBe(true);
    expect(published.some((p) => p.key === 'eddington_number')).toBe(false);
  });

  it('stays idle and never fetches when nothing is demanded', async () => {
    let fetchCalled = false;
    stubSdk({ pluginFetch: async () => { fetchCalled = true; return jsonResponse([]); } });
    await mount([]);
    expect(fetchCalled).toBe(false);
  });

  it('clears a key that drops out of the demand set', async () => {
    const { cleared } = stubSdk();
    await mount(['last_activity_type', 'current_streak']);
    await rerender(['current_streak']);
    expect(cleared).toContain('last_activity_type');
    expect(cleared).not.toContain('current_streak');
  });
});
