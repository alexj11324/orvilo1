'use client';

/**
 * The single first-party host for the LobeHub runtime.
 *
 * `@lobehub/editor` and `@lobehub/charts` still render `@lobehub/ui`
 * components, read antd-style context (`useThemeMode`, `useTheme`) and style
 * themselves through `cssVar.*`, i.e. `var(--ant-*)`. Orvilo itself no longer
 * mounts any LobeHub or antd provider (see
 * docs/development/antd-retirement-plan.md), so every place that renders one
 * of those packages wraps it in this scope:
 *
 * - a local lobehub `ThemeProvider` (no global style, no CDN fonts) whose antd
 *   token comes from the local generator (`generateEngineToken`), so vendor
 *   colours follow the document theme, accent and base colour;
 * - the `.orvilo-editor-scope` class, which carries the `--ant-*` aliases
 *   (`editorScopeCss()`) and is the only subtree vendor emotion class rules can
 *   match (`installStyleLayer.ts`);
 * - antd cssinjs in `@layer antd` and emotion in `@layer antd-style`, both
 *   ordered below Tailwind's `components` and `utilities` in `globals.css`;
 * - the lobehub portal host (`#lobe-ui-theme-app` / `useAppElement`) and a
 *   lobehub `ToastHost`, so editor menus, toolbars, image previews and toasts
 *   portal inside the scope and keep its variables and styles.
 *
 * This directory is the only first-party code allowed to import `@lobehub/ui`,
 * `antd-style` or `@ant-design/cssinjs` (enforced in `eslint.config.mjs` and
 * `src/antdRetirementRatchet.test.ts`).
 */
import { StyleProvider } from '@ant-design/cssinjs';
import { ConfigProvider, ThemeProvider, ToastHost } from '@lobehub/ui';
import { cn } from 'cn';
import * as m from 'motion/react-m';
import {
  createContext,
  type CSSProperties,
  memo,
  type PropsWithChildren,
  use,
  useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useIsDark } from '@/hooks/useIsDark';
import { getUILocaleAndResources } from '@/libs/getUILocaleAndResources';
import type { UILocaleResources } from '@/libs/getUILocaleAndResources.utils';
import { mergeUILocaleResources, resolveUILocale } from '@/libs/getUILocaleAndResources.utils';
import Image from '@/libs/next/Image';
import Link from '@/libs/next/Link';
import {
  EDITOR_SCOPE_CLASS,
  editorScopeCss,
  generateEngineToken,
  generateTheme,
} from '@/styles/theme/generate';
import { useOptionalGeneratedTheme, useOptionalMotionEnabled } from '@/styles/themeRoles';

const SCOPE_CSS = editorScopeCss();

// The antd `App` root lobehub renders becomes a box-less wrapper: it must not
// change layout, and its text defaults must not replace what the host
// container already gives the vendor tree.
const SCOPE_ROOT_STYLE: CSSProperties = {
  color: 'inherit',
  display: 'contents',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
};

const LOBE_CONFIG = { aAs: Link, imgAs: Image, imgUnoptimized: true };

const loadBuiltinResources = async (locale: string): Promise<UILocaleResources | null> => {
  try {
    const { en, zhCn } = await import('@lobehub/ui/es/i18n/resources/index');
    return (locale.startsWith('zh') ? zhCn : en) as UILocaleResources;
  } catch {
    return null;
  }
};

const resourceCache = new Map<string, Promise<UILocaleResources>>();

/** Lobehub's own strings, overridden by the business `locales/<lang>/ui.json`. */
const loadUIResources = (language: string) => {
  let pending = resourceCache.get(language);
  if (!pending) {
    pending = Promise.all([
      loadBuiltinResources(resolveUILocale(language).normalizedLocale),
      getUILocaleAndResources(language).then(({ resources }) => resources),
    ]).then(([builtin, business]) => mergeUILocaleResources(builtin, business) ?? business);
    resourceCache.set(language, pending);
  }
  return pending;
};

// Wrap every component that renders vendor JSX; a scope nested in another one
// renders its children directly, so a page pays for one provider stack.
const InsideScopeContext = createContext(false);

export interface LobeThemeScopeProps extends PropsWithChildren {
  className?: string;
}

const ScopeProviders = memo<LobeThemeScopeProps>(({ children, className }) => {
  const isDark = useIsDark();
  const hostTheme = useOptionalGeneratedTheme();
  const motion = useOptionalMotionEnabled();
  const { i18n } = useTranslation();
  const language = i18n?.language || 'en-US';

  const theme = useMemo(
    () => hostTheme ?? generateTheme({ mode: isDark ? 'dark' : 'light' }),
    [hostTheme, isDark],
  );
  const antdTheme = useMemo(
    () => ({
      token: {
        ...generateEngineToken(theme),
        fontFamily: 'var(--font-sans)',
        fontFamilyCode: 'var(--font-mono)',
        motion,
      },
    }),
    [motion, theme],
  );
  const resources = useMemo(() => loadUIResources(language), [language]);

  return (
    <StyleProvider layer>
      <ConfigProvider
        config={LOBE_CONFIG}
        locale={resolveUILocale(language).uiLocale}
        motion={m}
        resources={resources}
      >
        <ThemeProvider
          appearance={theme.mode}
          className={cn(EDITOR_SCOPE_CLASS, className)}
          defaultAppearance={theme.mode}
          defaultThemeMode={theme.mode}
          enableCustomFonts={false}
          enableGlobalStyle={false}
          style={SCOPE_ROOT_STYLE}
          theme={antdTheme}
        >
          <style href={EDITOR_SCOPE_CLASS} precedence="default">
            {SCOPE_CSS}
          </style>
          <InsideScopeContext value>{children}</InsideScopeContext>
          <ToastHost />
        </ThemeProvider>
      </ConfigProvider>
    </StyleProvider>
  );
});

ScopeProviders.displayName = 'LobeThemeScopeProviders';

const LobeThemeScope = ({ children, className }: LobeThemeScopeProps) =>
  use(InsideScopeContext) ? (
    children
  ) : (
    <ScopeProviders className={className}>{children}</ScopeProviders>
  );

LobeThemeScope.displayName = 'LobeThemeScope';

export default LobeThemeScope;
