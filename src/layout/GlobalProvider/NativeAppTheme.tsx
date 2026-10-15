'use client';

import '@/styles/fonts.css';

import { type ReactNode, useEffect } from 'react';

import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { ORVILO_THEME_NEUTRAL_COLOR, ORVILO_THEME_PRIMARY_COLOR } from '@/const/theme';
import { useCustomFontStylesheet } from '@/hooks/useCustomFontStylesheet';
import { useIsDark } from '@/hooks/useIsDark';
import { resolveUILocale } from '@/libs/getUILocaleAndResources.utils';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors, userGeneralSettingsSelectors } from '@/store/user/selectors';
import { BaseGlobalStyle, GlobalStyle } from '@/styles';
import type { UserNeutralColor, UserPrimaryColor } from '@/styles/nativeThemeSwatches';
import { setCookie } from '@/utils/client/cookie';

import styles from './AppTheme.module.css';
import { NativeThemeProvider } from './NativeThemeProvider';

/** Composition target once the retained SDK-theme consumers have migrated.
 * Uses the same preferences, fonts, cookies and existing data-theme authority. */
export function NativeAppTheme({
  children,
  defaultPrimaryColor,
  defaultNeutralColor,
  customFontFamily,
  customFontURL,
  enableCustomFonts = true,
}: {
  children?: ReactNode;
  defaultPrimaryColor?: UserPrimaryColor;
  defaultNeutralColor?: UserNeutralColor;
  customFontFamily?: string;
  customFontURL?: string;
  enableCustomFonts?: boolean;
}) {
  const dark = useIsDark();
  const language = useGlobalStore(systemStatusSelectors.language);
  const primaryColor = useUserStore(userGeneralSettingsSelectors.primaryColor);
  const neutralColor = useUserStore(userGeneralSettingsSelectors.neutralColor);
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const userFontFamily = useUserStore(preferenceSelectors.fontFamily);
  const userFontFamilyCode = useUserStore(preferenceSelectors.terminalFontFamily);
  useCustomFontStylesheet(enableCustomFonts ? customFontURL : undefined);
  useEffect(() => {
    setCookie(ORVILO_THEME_PRIMARY_COLOR, primaryColor);
  }, [primaryColor]);
  useEffect(() => {
    setCookie(ORVILO_THEME_NEUTRAL_COLOR, neutralColor);
  }, [neutralColor]);
  const locale = resolveUILocale(language).normalizedLocale;
  return (
    <NativeThemeProvider
      animationMode={animationMode}
      appearance={dark ? 'dark' : 'light'}
      fontFamily={genFontFamily({ locale, customFontFamily, userFontFamily })}
      fontFamilyCode={genFontFamilyCode({ locale, userFontFamily: userFontFamilyCode })}
      neutralColor={neutralColor ?? defaultNeutralColor}
      primaryColor={primaryColor ?? defaultPrimaryColor}
    >
      <BaseGlobalStyle />
      <GlobalStyle />
      <div className={styles.app}>{children}</div>
    </NativeThemeProvider>
  );
}
