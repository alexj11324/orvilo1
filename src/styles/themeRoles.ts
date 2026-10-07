import { createGlobalStyle, css } from 'antd-style';
import { getContrast, mix, readableColor } from 'polished';

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

const stopLocalMotion = css`
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
  .animate-spin,
  .text-shiny,
  .text-shiny::after {
    transition: none !important;
    animation: none !important;
  }

  .text-shiny {
    color: var(--shiny-color);
    background: none;
  }

  .text-shiny::after {
    display: none;
  }
`;

// Mount only in a document's top-level App/Auth/Share/Workbench theme host.
// Resolved values keep body portals independent of scoped .orvilo-vars tokens.
export const ThemeRoles = createGlobalStyle(({ theme }) => {
  const surface = theme.colorBgContainer;
  const status = (name: string, fill: string, text: string) => {
    const wash = mix(0.1, fill, surface);
    return css`
      --${name}: ${fill};
      --${name}-on-fill: ${readableColor(fill)};
      --${name}-subtle: ${wash};
      --${name}-text: ${stateText(text, wash, surface, theme.colorText, mix(0.2, fill, surface))};
    `;
  };

  return css`
    ${
      theme.isDarkMode
        ? "html[data-theme='dark'], html.dark"
        : "html:not([data-theme='dark']):not(.dark)"
    } {
      --background: ${theme.colorBgLayout};
      --foreground: ${theme.colorText};
      --card: ${surface};
      --card-foreground: ${theme.colorText};
      --popover: ${theme.colorBgElevated};
      --popover-foreground: ${theme.colorText};
      --primary: ${theme.colorPrimary};
      --primary-foreground: ${readableColor(theme.colorPrimary)};
      --primary-hover: ${theme.colorPrimaryHover};
      --primary-hover-foreground: ${readableColor(theme.colorPrimaryHover)};
      --secondary: ${theme.colorBgContainerSecondary};
      --secondary-foreground: ${theme.colorText};
      --muted: ${theme.colorBgContainerSecondary};
      --muted-foreground: ${theme.colorTextSecondary};
      --accent: ${theme.colorFillTertiary};
      --accent-foreground: ${theme.colorText};
      --selected: ${theme.colorFillSecondary};
      --border: ${theme.colorBorder};
      --input: ${mix(0.5, theme.colorBorder, theme.colorText)};
      --ring: ${readableColor(surface)};
      --font-sans: ${theme.fontFamily};
      --font-mono: ${theme.fontFamilyCode};
      --shadow-popover: ${theme.boxShadowSecondary};
      --shadow-dialog: ${theme.boxShadow};
      --sidebar: ${theme.colorBgLayout};
      --sidebar-foreground: ${theme.colorText};
      --sidebar-primary: ${theme.colorPrimary};
      --sidebar-primary-foreground: ${readableColor(theme.colorPrimary)};
      --sidebar-accent: ${theme.colorFillTertiary};
      --sidebar-accent-foreground: ${theme.colorText};
      --sidebar-border: ${theme.colorBorderSecondary};
      --sidebar-ring: ${readableColor(surface)};
      --sidebar-muted: ${theme.colorTextSecondary};
      --sidebar-group: ${theme.colorTextSecondary};
      --orvilo-motion-fast: ${theme.motionDurationFast};
      --orvilo-motion-mid: ${theme.motionDurationMid};
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

    ${theme.motion === false && stopLocalMotion}

    @media (prefers-reduced-motion: reduce) {
      ${stopLocalMotion}
    }
  `;
});
