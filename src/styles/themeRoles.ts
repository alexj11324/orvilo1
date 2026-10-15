'use client';

import { ThemeContext } from '@emotion/react';
import type { LobeCustomToken, ThemeProviderProps } from '@lobehub/ui';
import { darken, getContrast, lighten, mix, readableColor, rgba, saturate } from 'polished';
import { createContext, createElement, type ReactNode, use, useMemo } from 'react';

// This is the existing SDK's resolved styled-theme value, not another palette
// or provider. Public SDK types retain custom tokens and numeric screen aliases.
export type ResolvedDocumentTheme = Parameters<
  NonNullable<ThemeProviderProps['customToken']>
>[0]['token'] &
  LobeCustomToken & { isDarkMode: boolean };

// One text role must remain readable on both a status wash and an outline surface.
export const stateText = (
  color: string,
  wash: string,
  surface: string,
  text: string,
  hover = wash,
) =>
  [color, mix(0.5, color, text), text].find(
    (candidate) =>
      getContrast(candidate, wash) >= 4.5 &&
      getContrast(candidate, hover) >= 4.5 &&
      getContrast(candidate, surface) >= 4.5,
  ) ?? readableColor(surface);

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

// Mount only in a document's top-level App/Auth/Share/Workbench theme host.
// Resolved values keep body portals independent of scoped .orvilo-vars tokens.
const createThemeRoleStyles = (theme: ResolvedDocumentTheme) => {
  const surface = theme.colorBgContainer;
  const status = (name: string, fill: string, text: string) => {
    const wash = mix(0.1, fill, surface);
    return `
      --${name}: ${fill};
      --${name}-on-fill: ${readableColor(fill)};
      --${name}-subtle: ${wash};
      --${name}-text: ${stateText(text, wash, surface, theme.colorText, mix(0.2, fill, surface))};
    `;
  };

  // Category identity is a domain role, independent of success/warning states.
  // Keep its existing palette and JS color algebra on the composed theme host.
  const colors = [
    theme.volcano,
    theme.orange,
    theme.gold,
    theme.green,
    theme.cyan,
    theme.blue,
    theme.geekblue,
    theme.purple,
    theme.magenta,
    theme.pink,
  ];
  const memoryCategories = colors
    .map((_, index) => {
      const color = saturate(
        theme.isDarkMode ? 0.25 : 0.5,
        mix(
          theme.isDarkMode ? 0.06 : 0.05,
          colors[index],
          theme.isDarkMode ? theme.colorBgContainer : theme.colorBgLayout,
        ),
      );
      return `
      --memory-category-${index}-background: ${color};
      --memory-category-${index}-background-text: ${stateText(theme.isDarkMode ? lighten(0.5, color) : darken(0.5, color), color, color, theme.colorText)};
      --memory-category-${index}-text: ${stateText(theme.isDarkMode ? lighten(0.4, color) : darken(0.6, color), color, color, theme.colorText)};
      --memory-category-${index}-shadow: ${rgba(darken(0.6, color), theme.isDarkMode ? 0.5 : 0.2)};
    `;
    })
    .join('');

  return `
    ${
      theme.isDarkMode
        ? "html[data-theme='dark'], html.dark"
        : "html:not([data-theme='dark']):not(.dark)"
    } {
      --background: ${theme.colorBgLayout};
      --foreground: ${theme.colorText};
      --card: ${surface};
      --surface-secondary: ${theme.colorBgContainerSecondary};
      --card-foreground: ${theme.colorText};
      --link-active: ${theme.colorLinkActive};
      --popover: ${theme.colorBgElevated};
      --popover-foreground: ${theme.colorText};
      --overlay-mask: ${theme.colorBgMask};
      --overlay-mask-foreground: ${theme.colorTextLightSolid};
      --primary: ${theme.colorPrimary};
      --link: ${theme.colorLink};
      --primary-foreground: ${readableColor(theme.colorPrimary)};
      --primary-hover: ${theme.colorPrimaryHover};
      --primary-hover-foreground: ${readableColor(theme.colorPrimaryHover)};

      /* Neutral fills are translucent washes so they read on every surface.
         --muted, --secondary and --accent share the hover wash; --selected sits
         one step above it. See docs/development/semantic-token-roles.md. */
      --secondary: ${theme.colorFillTertiary};
      --secondary-foreground: ${theme.colorText};
      --muted: ${theme.colorFillTertiary};
      --muted-foreground: ${theme.colorTextSecondary};
      --loading-ring-fill: ${theme.colorFill};
      --scrollbar-fill: ${theme.colorFill};
      --foreground-tertiary: ${theme.colorTextTertiary};
      --foreground-quaternary: ${theme.colorTextQuaternary};
      --foreground-description: ${theme.colorTextDescription};
      --info-hover-wash: ${theme.colorInfoBgHover};
      --fill-quaternary: ${theme.colorFillQuaternary};
      --divider: ${theme.colorBorderSecondary};
      --split-divider: ${theme.colorSplit};
      --primary-wash: ${theme.colorPrimaryBg};
      --primary-border: ${theme.colorPrimaryBorder};
      --primary-border-hover: ${theme.colorPrimaryBorderHover};
      --success-wash: ${theme.colorSuccessBg};
      --success-border: ${theme.colorSuccessBorder};
      --warning-wash: ${theme.colorWarningBg};
      --warning-border: ${theme.colorWarningBorder};
      --surface-disabled: ${theme.colorBgContainerDisabled};
      --server-version-warning-bg: ${theme.yellowBg};
      --server-version-warning-text: ${stateText(theme.colorWarningText, theme.yellowBg, surface, theme.colorText)};
      --topic-running-ring: ${theme.isDarkMode ? theme.colorWarningBorder : `color-mix(in srgb, ${theme.colorWarning} 45%, transparent)`};
      --info-wash: ${theme.colorInfoBg};
      --info-border: ${theme.colorInfoBorder};
      --highlight-gold: ${theme.gold4};
      --highlight-primary: ${theme.colorPrimaryBgHover};
      --destructive-wash: ${theme.colorErrorBg};
      --destructive-border: ${theme.colorErrorBorder};
      --accent: ${theme.colorFillTertiary};
      --accent-foreground: ${theme.colorText};
      --selected: ${theme.colorFillSecondary};
      --border: ${theme.colorBorder};
      --input: ${mix(0.5, theme.colorBorder, theme.colorText)};
      --ring: ${theme.colorText};
      --font-sans: ${theme.fontFamily};
      --font-mono: ${theme.fontFamilyCode};
      --shadow-raised: ${theme.boxShadowTertiary};
      --shadow-popover: ${theme.boxShadowSecondary};

      /* Dark dialogs sit on a scrim with a 1px ring; the engine's heavy black
         shadow only reads as a smudge under them. */
      --shadow-dialog: ${theme.isDarkMode ? 'none' : theme.boxShadow};
      --sidebar: ${theme.colorBgLayout};
      --sidebar-foreground: ${theme.colorText};
      --sidebar-primary: ${theme.colorPrimary};
      --sidebar-primary-foreground: ${readableColor(theme.colorPrimary)};
      --sidebar-accent: ${theme.colorFillTertiary};
      --sidebar-accent-foreground: ${theme.colorText};
      --sidebar-border: ${theme.colorBorderSecondary};
      --sidebar-ring: ${theme.colorText};
      --sidebar-muted: ${theme.colorTextSecondary};
      --sidebar-group: ${theme.colorTextSecondary};
      --orvilo-motion-fast: ${theme.motionDurationFast};
      --orvilo-motion-mid: ${theme.motionDurationMid};
      --orvilo-motion-ease-out: ${theme.motionEaseOut};
      --orvilo-motion-ease-in-out: ${theme.motionEaseInOut};
      --orvilo-motion-slow: ${theme.motionDurationSlow};
      ${status('primary', theme.colorPrimary, theme.colorPrimaryText)}
      ${status('success', theme.colorSuccess, theme.colorSuccessText)}
      ${status('warning', theme.colorWarning, theme.colorWarningText)}
      ${status('info', theme.colorInfo, theme.colorInfoText)}
      ${status('destructive', theme.colorError, theme.colorErrorText)}
      --success-foreground: var(--success-text);
      --warning-foreground: var(--warning-text);
      --info-foreground: var(--info-text);
      --destructive-foreground: var(--destructive-text);
      --invert: ${theme.colorText};
      --invert-foreground: ${surface};
      ${memoryCategories}
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

    ${theme.motion === false ? stopLocalMotion : ''}

    @media (prefers-reduced-motion: reduce) {
      ${stopLocalMotion}
    }
  `;
};

// The same value already publishes the existing accent/fill semantic CSS roles.
// Keep resolution at the single application theme authority, not in leaf UI.
interface ResolvedThemeRoleValues {
  fillTertiary: string;
  largeMinWidth: number;
  mediumMinWidth: number;
  mobileMaxWidth: number;
  motionDurationMid: string;
  motionEnabled: boolean;
}

const ResolvedFillTertiaryContext = createContext<ResolvedThemeRoleValues | undefined>(undefined);
// Current App/Auth/Share/Workbench provider audit supplies no responsive overrides.
// This is the installed public xs alias default (screenSM 576 - 1), also used
// for a genuinely unconfigured/outside-theme consumer. Configured consumers
// receive their actual resolved value from the existing theme authority above.
const DEFAULT_MOBILE_MAX_WIDTH = 575;
// Installed/public screenLG alias default; deliberately not Tailwind lg1024.
const DEFAULT_LARGE_MIN_WIDTH = 992;
// Installed public screenMD default; medium remains independent of LG992/XS575.
const DEFAULT_MEDIUM_MIN_WIDTH = 768;

export function ThemeRoles({ children }: { children?: ReactNode }) {
  // @lobehub/ui's installed public provider supplies this same complete
  // Emotion context; SDK style consumers keep their existing authority.
  const theme = use(ThemeContext) as ResolvedDocumentTheme;
  const values = useMemo(
    () => ({
      fillTertiary: theme.colorFillTertiary,
      motionEnabled: theme.motion !== false,
      motionDurationMid: theme.motionDurationMid,
      mobileMaxWidth: theme.screenXSMax,
      largeMinWidth: theme.screenLG,
      mediumMinWidth: theme.screenMD,
    }),
    [
      theme.colorFillTertiary,
      theme.screenXSMax,
      theme.screenLG,
      theme.screenMD,
      theme.motion,
      theme.motionDurationMid,
    ],
  );
  return createElement(
    ResolvedFillTertiaryContext.Provider,
    { value: values },
    createElement('style', { 'data-orvilo-theme-roles': '' }, createThemeRoleStyles(theme)),
    children,
  );
}

export function useResolvedFillTertiary(): string {
  const fill = use(ResolvedFillTertiaryContext);
  if (fill === undefined) {
    throw new Error('ThemeRoles must wrap resolved semantic token consumers');
  }
  return fill.fillTertiary;
}

export function useResolvedMobileMaxWidth(): number {
  const values = use(ResolvedFillTertiaryContext);
  return values?.mobileMaxWidth ?? DEFAULT_MOBILE_MAX_WIDTH;
}

export function useResolvedLargeMinWidth(): number {
  const values = use(ResolvedFillTertiaryContext);
  return values?.largeMinWidth ?? DEFAULT_LARGE_MIN_WIDTH;
}

export function useResolvedMediumMinWidth(): number {
  const values = use(ResolvedFillTertiaryContext);
  return values?.mediumMinWidth ?? DEFAULT_MEDIUM_MIN_WIDTH;
}

export function useResolvedMotionValues(): { enabled: boolean; durationMid: string } {
  const values = use(ResolvedFillTertiaryContext);
  if (values === undefined) {
    throw new Error('ThemeRoles must wrap resolved motion consumers');
  }
  return { enabled: values.motionEnabled, durationMid: values.motionDurationMid };
}
