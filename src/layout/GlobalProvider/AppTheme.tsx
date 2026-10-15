'use client';

import '@/styles/fonts.css';

import type { NeutralColorName, PrimaryColorName } from '@orvilo/types';
import { type CSSProperties, type ReactNode } from 'react';
import { memo, useEffect, useMemo } from 'react';

import CdnWebFonts from '@/components/CdnWebFonts';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { ORVILO_THEME_NEUTRAL_COLOR, ORVILO_THEME_PRIMARY_COLOR } from '@/const/theme';
import { useIsDark } from '@/hooks/useIsDark';
import { resolveUILocale } from '@/libs/getUILocaleAndResources.utils';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors, userGeneralSettingsSelectors } from '@/store/user/selectors';
import { BaseGlobalStyle, GlobalStyle } from '@/styles';
import { ThemeRoles } from '@/styles/themeRoles';
import { setCookie } from '@/utils/client/cookie';

import styles from './AppTheme.module.css';

/** Marks the application root; full-screen overlays portal into it. */
export const APP_ROOT_ATTRIBUTE = 'data-orvilo-app-root';

// The former vendor App root's inline box: an isolated stacking context that
// inherits the document's min-height and width.
const appRootStyle: CSSProperties = {
  isolation: 'isolate',
  minHeight: 'inherit',
  width: 'inherit',
};

export interface AppThemeProps {
  children?: ReactNode;
  customFontFamily?: string;
  customFontURL?: string;
  defaultNeutralColor?: NeutralColorName;
  defaultPrimaryColor?: PrimaryColorName;
  enableCustomFonts?: boolean;
  globalCDN?: boolean;
}

const AppTheme = memo<AppThemeProps>(
  ({
    children,
    defaultPrimaryColor,
    defaultNeutralColor,
    globalCDN,
    enableCustomFonts,
    customFontURL,
    customFontFamily,
  }) => {
    const language = useGlobalStore(systemStatusSelectors.language);
    const isDark = useIsDark();

    const [primaryColor, neutralColor, animationMode] = useUserStore((s) => [
      userGeneralSettingsSelectors.primaryColor(s),
      userGeneralSettingsSelectors.neutralColor(s),
      userGeneralSettingsSelectors.animationMode(s),
    ]);
    const [userFontFamily, userFontFamilyCode] = useUserStore((s) => [
      preferenceSelectors.fontFamily(s),
      preferenceSelectors.terminalFontFamily(s),
    ]);
    const fontFamily = useMemo(
      () =>
        genFontFamily({
          customFontFamily,
          locale: resolveUILocale(language).normalizedLocale,
          userFontFamily,
        }),
      [customFontFamily, language, userFontFamily],
    );
    const fontFamilyCode = useMemo(
      () =>
        genFontFamilyCode({
          locale: resolveUILocale(language).normalizedLocale,
          userFontFamily: userFontFamilyCode,
        }),
      [language, userFontFamilyCode],
    );

    useEffect(() => {
      setCookie(ORVILO_THEME_PRIMARY_COLOR, primaryColor);
    }, [primaryColor]);

    useEffect(() => {
      setCookie(ORVILO_THEME_NEUTRAL_COLOR, neutralColor);
    }, [neutralColor]);

    return (
      <div className={styles.app} style={appRootStyle} {...{ [APP_ROOT_ATTRIBUTE]: '' }}>
        <CdnWebFonts
          customFontURL={customFontURL}
          enabled={enableCustomFonts !== false}
          globalCDN={globalCDN}
        />
        <BaseGlobalStyle />
        <GlobalStyle />
        <ThemeRoles
          animationMode={animationMode}
          appearance={isDark ? 'dark' : 'light'}
          fontFamily={fontFamily}
          fontFamilyCode={fontFamilyCode}
          neutralColor={neutralColor ?? defaultNeutralColor}
          primaryColor={primaryColor ?? defaultPrimaryColor}
        >
          {children}
        </ThemeRoles>
      </div>
    );
  },
);

export default AppTheme;
