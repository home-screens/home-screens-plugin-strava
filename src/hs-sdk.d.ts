/**
 * Type declarations for the Home Screens plugin SDK.
 * These globals are provided by the host app at runtime.
 *
 * Extends the template's declarations with the host ≥1.7.0 surface this
 * plugin relies on: getAuthStatus (OAuth adapter status), translate/locale
 * (plugin i18n), and the shared-state bus.
 */

import type { FC, ReactNode } from 'react';

// ─── Supporting Types ────────────────────────────────────────────────────────

/** Host settings snapshot — read-only */
interface HostSettings {
  timezone: string;
  units: 'metric' | 'imperial';
  latitude: number | null;
  longitude: number | null;
  displayWidth: number;
  displayHeight: number;
  appVersion: string;
}

/** Plugin events emitted to the host */
type PluginEvent =
  | { type: 'navigate'; direction: 'next' | 'prev' | 'screen'; screenIndex?: number }
  | { type: 'refresh' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

/** Server-side proxy options */
interface PluginFetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  payload?: string;
  secretInjections?: {
    header?: Record<string, string>;
    query?: Record<string, string>;
  };
  cacheTtlMs?: number;
  /** Skip auth-adapter token injection for this request */
  skipAuth?: boolean;
}

// ─── Component Props ─────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface SectionHeadingProps {
  children: ReactNode;
}

interface ModuleLoadingStateProps {
  loading?: boolean;
  error?: string;
  children: ReactNode;
}

/** AccordionSection component props (editor-only) */
interface AccordionSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** useModuleConfig return type (editor-only) */
interface ModuleConfigResult<T> {
  config: T;
  set: (updates: Partial<T>) => void;
}

// ─── Global Declarations ─────────────────────────────────────────────────────

declare global {
  interface Window {
    /** Provided by the host — do not bundle React */
    React: typeof import('react');
    /** Provided by the host — do not bundle ReactDOM */
    ReactDOM: typeof import('react-dom');

    /** Shared SDK from the host app (optional so tests can run without it) */
    __HS_SDK__?: {
      // ── CSS Classes ──
      INPUT_CLASS: string;
      NESTED_INPUT_CLASS: string;

      // ── UI Components ──
      Slider: FC<SliderProps>;
      ColorPicker: FC<ColorPickerProps>;
      Toggle: FC<ToggleProps>;
      SectionHeading: FC<SectionHeadingProps>;
      ModuleLoadingState: FC<ModuleLoadingStateProps>;

      // ── Data Fetching ──
      useFetchData: <T>(url: string | null, refreshMs: number) => [T | null, string | null];

      // ── Display Cache ──
      displayCache: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
        prefetch: (keys: string[]) => Promise<void>;
      };

      // ── Host Settings ──
      getHostSettings: () => HostSettings;

      // ── Event Emitter ──
      emit: (event: PluginEvent) => void;

      // ── Event Bus ──
      on?: (channel: string, handler: (data: unknown) => void) => () => void;

      // ── Shared-State Bus ──
      publishState?: (pluginId: string, key: string, value: string) => void;
      clearState?: (pluginId: string, key: string) => void;

      // ── Server-Side Proxy ──
      pluginFetch: (pluginId: string, options: PluginFetchOptions) => Promise<Response>;

      // ── Auth Adapter (host ≥1.7.0) ──
      /** Connection status of the plugin's server-side auth adapter */
      getAuthStatus?: (pluginId: string) => Promise<{ connected: boolean; expiresAt?: number }>;

      // ── i18n (host ≥1.7.0) ──
      /** Active BCP-47 locale tag */
      locale?: string;
      /** Look up a translation by dotted key; returns the raw key on a miss */
      translate?: (key: string, vars?: Record<string, string | number>) => string;

      // ── Editor-Only (may be undefined on display page) ──
      AccordionSection?: FC<AccordionSectionProps>;
      useModuleConfig?: <T = Record<string, unknown>>(
        moduleId: string,
        screenId: string,
      ) => ModuleConfigResult<T>;
    };

    /** Plugin export target — set by the IIFE wrapper, read by the host loader */
    __HS_PLUGIN__: Record<string, unknown>;
  }
}

export {};
