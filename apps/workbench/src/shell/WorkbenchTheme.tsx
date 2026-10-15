'use client';

import '@/app/globals.css';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { domMax, LazyMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, type PropsWithChildren, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { useIsDark } from '@/hooks/useIsDark';
import Image from '@/libs/next/Image';
import Link from '@/libs/next/Link';
import { generateEngineToken, generateTheme } from '@/styles/theme/generate';
import { ThemeRoles } from '@/styles/themeRoles';

const WorkbenchTheme = memo<PropsWithChildren>(({ children }) => {
  const isDark = useIsDark();
  const { i18n } = useTranslation();
  const appearance = isDark ? 'dark' : 'light';
  const fontFamily = genFontFamily({ locale: i18n.language });
  const fontFamilyCode = genFontFamilyCode({ locale: i18n.language });
  const engineToken = useMemo(
    () => generateEngineToken(generateTheme({ mode: appearance })),
    [appearance],
  );

  return (
    <ConfigProvider config={{ aAs: Link, imgAs: Image, imgUnoptimized: true }} motion={m}>
      <ThemeProvider
        appearance={appearance}
        className={'workbench-layout'}
        defaultAppearance={appearance}
        defaultThemeMode={appearance}
        style={{ height: '100%', minHeight: '100dvh', width: '100%' }}
        theme={{
          cssVar: { key: 'orvilo-vars' },
          token: { ...engineToken, fontFamily, fontFamilyCode },
        }}
      >
        <ThemeRoles appearance={appearance} fontFamily={fontFamily} fontFamilyCode={fontFamilyCode}>
          <div className="h-full">
            <LazyMotion features={domMax}>{children}</LazyMotion>
          </div>
        </ThemeRoles>
      </ThemeProvider>
    </ConfigProvider>
  );
});

WorkbenchTheme.displayName = 'WorkbenchTheme';

export default WorkbenchTheme;
