'use client';

import type { AnimationMode } from '@orvilo/types';
import { createContext, createElement, type ReactNode, use, useMemo } from 'react';

import {
  type GeneratedTheme,
  generateTheme,
  type ThemeMode,
  toDeclarations,
} from './theme/generate';
import type { NeutralColorName, PrimaryColorName } from './theme/seeds';

const stopLocalMotion = `
  [data-slot],
  [data-slot]::before,
  [data-slot]::after,
  [class*='animate-'],
  [class*='animate-']::before,
  [class*='animate-']::after,
  [class*='transition-'],
  [class*='transition-']::before,
  [class*='transition-']::after,
  [class~='transition'],
  [class~='transition']::before,
  [class~='transition']::after,
  .orvilo-motion-scope,
  .orvilo-motion-scope *,
  .orvilo-motion-scope::before,
  .orvilo-motion-scope::after,
  .orvilo-motion-scope *::before,
  .orvilo-motion-scope *::after,
  .animate-spin,
  .text-shiny,
  .text-shiny::after,
  .orvilo-shiny,
  .orvilo-shiny::after {
    transition: none !important;
    animation: none !important;
  }

  .text-shiny,
  .orvilo-shiny {
    color: var(--shiny-rest-color, var(--shiny-color));
    background: none;
  }

  .text-shiny::after,
  .orvilo-shiny::after {
    display: none;
  }
`;

const MOTION_EASE_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)';
const MOTION_EASE_IN_OUT = 'cubic-bezier(0.645, 0.045, 0.355, 1)';
// Existing unit per animation mode: fast = 1, mid = 2, slow = 3 units, rounded
// to 0.1s as the engine did (agile therefore stays 0.1s at every speed).
const motionUnit = (mode: AnimationMode | undefined) => (mode === 'agile' ? 0.05 : 0.1);
const seconds = (value: number) => `${value.toFixed(1)}s`;

interface ThemeRoleStyleInput {
  animationMode?: AnimationMode;
  fontFamily?: string;
  fontFamilyCode?: string;
  theme: GeneratedTheme;
}

// Mount only in a document's top-level App/Auth/Share/Workbench theme host.
// Every colour comes from the local generator (src/styles/theme/generate.ts);
// globals.css carries the same defaults for paint before this host mounts.
const createThemeRoleStyles = ({
  animationMode,
  fontFamily,
  fontFamilyCode,
  theme,
}: ThemeRoleStyleInput) => {
  const unit = motionUnit(animationMode);
  const fonts = [
    fontFamily ? `--font-sans: ${fontFamily};` : '',
    fontFamilyCode ? `--font-mono: ${fontFamilyCode};` : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  return `
    ${
      theme.mode === 'dark'
        ? "html[data-theme='dark'], html.dark"
        : "html:not([data-theme='dark']):not(.dark)"
    } {
${toDeclarations(theme.roles, '      ')}
${toDeclarations(theme.palette, '      ')}
      ${fonts}
      --orvilo-motion-fast: ${seconds(unit)};
      --orvilo-motion-mid: ${seconds(unit * 2)};
      --orvilo-motion-slow: ${seconds(unit * 3)};
      --orvilo-motion-ease-out: ${MOTION_EASE_OUT};
      --orvilo-motion-ease-in-out: ${MOTION_EASE_IN_OUT};
      --font-size-base: 14px;
      --z-popup-base: 1000;
    }

    :root .ant-form-item .ant-form-item-explain-error,
    :root .ant-form-item .ant-form-item-required::before {
      color: var(--destructive-text);
    }

    :root [data-slot='input'][aria-invalid='true'],
    :root [data-slot='select-trigger'][aria-invalid='true'] {
      border-color: var(--destructive-text);
    }

    [data-slot='tooltip-content'],
    [data-slot='select-content'],
    [data-slot='dropdown-menu-content'],
    [data-slot='dropdown-menu-sub-content'],
    [data-slot='popover-content'],
    [data-slot='dialog-content'],
    [data-slot='dialog-overlay'] {
      animation-duration: var(--orvilo-motion-fast);
    }

    [data-slot='sheet-content'],
    [data-slot='sheet-overlay'] {
      transition-duration: var(--orvilo-motion-mid);
    }

    ${animationMode === 'disabled' ? stopLocalMotion : ''}

    @media (prefers-reduced-motion: reduce) {
      ${stopLocalMotion}
    }
  `;
};

interface ResolvedThemeRoleValues {
  fillTertiary: string;
  largeMinWidth: number;
  mediumMinWidth: number;
  mobileMaxWidth: number;
  motionDurationMid: string;
  motionEnabled: boolean;
  theme: GeneratedTheme;
}

const ResolvedThemeRolesContext = createContext<ResolvedThemeRoleValues | undefined>(undefined);
// No App/Auth/Share/Workbench host configures responsive overrides; these are
// the long-standing breakpoint defaults (xs max 575, md 768, lg 992), not
// Tailwind's lg1024.
const DEFAULT_MOBILE_MAX_WIDTH = 575;
const DEFAULT_LARGE_MIN_WIDTH = 992;
const DEFAULT_MEDIUM_MIN_WIDTH = 768;

export interface ThemeRolesProps {
  animationMode?: AnimationMode;
  appearance: ThemeMode;
  children?: ReactNode;
  fontFamily?: string;
  fontFamilyCode?: string;
  /** Stored base colour name; unset uses the default `gray` base. */
  neutralColor?: NeutralColorName | '';
  /** Stored accent name; unset keeps the monochrome primary. */
  primaryColor?: PrimaryColorName | '';
}

export function ThemeRoles({
  animationMode,
  appearance,
  children,
  fontFamily,
  fontFamilyCode,
  neutralColor,
  primaryColor,
}: ThemeRolesProps) {
  const theme = useMemo(
    () => generateTheme({ accent: primaryColor, base: neutralColor, mode: appearance }),
    [appearance, neutralColor, primaryColor],
  );
  const values = useMemo<ResolvedThemeRoleValues>(
    () => ({
      fillTertiary: theme.roles.muted,
      largeMinWidth: DEFAULT_LARGE_MIN_WIDTH,
      mediumMinWidth: DEFAULT_MEDIUM_MIN_WIDTH,
      mobileMaxWidth: DEFAULT_MOBILE_MAX_WIDTH,
      motionDurationMid: seconds(motionUnit(animationMode) * 2),
      motionEnabled: animationMode !== 'disabled',
      theme,
    }),
    [animationMode, theme],
  );
  const styles = useMemo(
    () => createThemeRoleStyles({ animationMode, fontFamily, fontFamilyCode, theme }),
    [animationMode, fontFamily, fontFamilyCode, theme],
  );
  return createElement(
    ResolvedThemeRolesContext.Provider,
    { value: values },
    createElement('style', { 'data-orvilo-theme-roles': '' }, styles),
    children,
  );
}

/** The generated theme the nearest ThemeRoles host publishes. */
export function useGeneratedTheme(): GeneratedTheme {
  const values = use(ResolvedThemeRolesContext);
  if (values === undefined) {
    throw new Error('ThemeRoles must wrap generated theme consumers');
  }
  return values.theme;
}

/** Like `useGeneratedTheme`, but `undefined` outside a ThemeRoles host. */
export function useOptionalGeneratedTheme(): GeneratedTheme | undefined {
  return use(ResolvedThemeRolesContext)?.theme;
}

/** Whether the nearest ThemeRoles host allows motion; `true` outside one. */
export function useOptionalMotionEnabled(): boolean {
  return use(ResolvedThemeRolesContext)?.motionEnabled ?? true;
}

export function useResolvedFillTertiary(): string {
  const values = use(ResolvedThemeRolesContext);
  if (values === undefined) {
    throw new Error('ThemeRoles must wrap resolved semantic token consumers');
  }
  return values.fillTertiary;
}

export function useResolvedMobileMaxWidth(): number {
  const values = use(ResolvedThemeRolesContext);
  return values?.mobileMaxWidth ?? DEFAULT_MOBILE_MAX_WIDTH;
}

export function useResolvedLargeMinWidth(): number {
  const values = use(ResolvedThemeRolesContext);
  return values?.largeMinWidth ?? DEFAULT_LARGE_MIN_WIDTH;
}

export function useResolvedMediumMinWidth(): number {
  const values = use(ResolvedThemeRolesContext);
  return values?.mediumMinWidth ?? DEFAULT_MEDIUM_MIN_WIDTH;
}

export function useResolvedMotionValues(): { enabled: boolean; durationMid: string } {
  const values = use(ResolvedThemeRolesContext);
  if (values === undefined) {
    throw new Error('ThemeRoles must wrap resolved motion consumers');
  }
  return { enabled: values.motionEnabled, durationMid: values.motionDurationMid };
}
