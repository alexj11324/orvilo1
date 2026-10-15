'use client';

import '@/app/globals.css';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { domMax, LazyMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { useIsDark } from '@/hooks/useIsDark';
import { NativeThemeProvider } from '@/layout/GlobalProvider/NativeThemeProvider';
import Image from '@/libs/next/Image';
import Link from '@/libs/next/Link';

const ShareTheme = memo<PropsWithChildren>(({ children }) => {
  const isDark = useIsDark();
  const { i18n } = useTranslation();
  const appearance = isDark ? 'dark' : 'light';
  const fontFamily = genFontFamily({ locale: i18n.language });
  const fontFamilyCode = genFontFamilyCode({ locale: i18n.language });

  return (
    <ConfigProvider config={{ aAs: Link, imgAs: Image, imgUnoptimized: true }} motion={m}>
      <ThemeProvider
        appearance={appearance}
        className={'share-layout'}
        defaultAppearance={appearance}
        defaultThemeMode={appearance}
        style={{ height: '100%', minHeight: '100dvh', width: '100%' }}
        theme={{
          cssVar: { key: 'orvilo-vars' },
          token: {
            fontFamily,
            fontFamilyCode,
          },
        }}
      >
        <NativeThemeProvider
          appearance={appearance}
          fontFamily={fontFamily}
          fontFamilyCode={fontFamilyCode}
        >
          <div className="h-full">
            <LazyMotion features={domMax}>{children}</LazyMotion>
          </div>
        </NativeThemeProvider>
      </ThemeProvider>
    </ConfigProvider>
  );
});

ShareTheme.displayName = 'ShareTheme';

export default ShareTheme;
