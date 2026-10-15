'use client';

import '@/styles/fonts.css';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import * as m from 'motion/react-m';
import { type ReactNode } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';

import Link from '@/components/Link';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { ORVILO_THEME_NEUTRAL_COLOR, ORVILO_THEME_PRIMARY_COLOR } from '@/const/theme';
import { useCustomFontStylesheet } from '@/hooks/useCustomFontStylesheet';
import { useIsDark } from '@/hooks/useIsDark';
import { getUILocaleAndResources } from '@/libs/getUILocaleAndResources';
import type { UILocaleResources } from '@/libs/getUILocaleAndResources.utils';
import { resolveUILocale } from '@/libs/getUILocaleAndResources.utils';
import Image from '@/libs/next/Image';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors, userGeneralSettingsSelectors } from '@/store/user/selectors';
import type { UserNeutralColor, UserPrimaryColor } from '@/styles/nativeThemeSwatches';
import { setCookie } from '@/utils/client/cookie';

import AntdStyleLayer from './AntdStyleLayer';
import styles from './AppTheme.module.css';
import { NativeAppTheme } from './NativeAppTheme';

export interface AppThemeProps {
  children?: ReactNode;
  customFontFamily?: string;
  customFontURL?: string;
  defaultNeutralColor?: UserNeutralColor;
  defaultPrimaryColor?: UserPrimaryColor;
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
    useCustomFontStylesheet(customFontURL);
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
    const [uiResources, setUIResources] = useState<UILocaleResources>();
    const [uiLocale, setUILocale] = useState(() => resolveUILocale(language).uiLocale);

    useEffect(() => {
      let mounted = true;
      setUILocale(resolveUILocale(language).uiLocale);
      getUILocaleAndResources(language)
        .then(({ locale, resources }) => {
          if (mounted) {
            setUILocale(locale);
            setUIResources(resources);
          }
        })
        .catch((error) => {
          console.error('Failed to load UI locale resources:', error);
        });
      return () => {
        mounted = false;
      };
    }, [language]);

    useEffect(() => {
      setCookie(ORVILO_THEME_PRIMARY_COLOR, primaryColor);
    }, [primaryColor]);

    useEffect(() => {
      setCookie(ORVILO_THEME_NEUTRAL_COLOR, neutralColor);
    }, [neutralColor]);

    const currentAppearence = isDark ? 'dark' : 'light';

    return (
      <AntdStyleLayer>
        <ConfigProvider
          locale={uiLocale}
          motion={m}
          resources={uiResources}
          config={{
            aAs: Link,
            imgAs: Image,
            imgUnoptimized: true,
            proxy: globalCDN ? 'unpkg' : undefined,
          }}
        >
          <ThemeProvider
            appearance={currentAppearence}
            className={styles.app}
            defaultAppearance={currentAppearence}
            defaultThemeMode={currentAppearence}
            enableCustomFonts={enableCustomFonts}
            enableGlobalStyle={false}
            customTheme={{
              neutralColor: neutralColor ?? defaultNeutralColor,
              primaryColor: primaryColor ?? defaultPrimaryColor,
            }}
            theme={{
              components: {
                Popover: { zIndexPopup: 1300 },
              },
              cssVar: { key: 'orvilo-vars' },
              token: {
                fontFamily,
                fontFamilyCode,
                motion: animationMode !== 'disabled',
                motionUnit: animationMode === 'agile' ? 0.05 : 0.1,
              },
            }}
          >
            <NativeAppTheme
              animationMode={animationMode}
              appearance={currentAppearence}
              fontFamily={fontFamily}
              fontFamilyCode={fontFamilyCode}
              neutralColor={neutralColor ?? defaultNeutralColor}
              primaryColor={primaryColor ?? defaultPrimaryColor}
            >
              {children}
            </NativeAppTheme>
          </ThemeProvider>
        </ConfigProvider>
      </AntdStyleLayer>
    );
  },
);

export default AppTheme;
