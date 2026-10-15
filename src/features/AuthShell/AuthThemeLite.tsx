'use client';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { domMax, LazyMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ToastHost } from '@/components/toast';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { useIsDark } from '@/hooks/useIsDark';
import AntdStyleLayer from '@/layout/GlobalProvider/AntdStyleLayer';
import { NativeThemeProvider } from '@/layout/GlobalProvider/NativeThemeProvider';
import Image from '@/libs/next/Image';
import Link from '@/libs/next/Link';
import { BaseGlobalStyle } from '@/styles';

interface AuthThemeLiteProps extends PropsWithChildren {
  globalCDN?: boolean;
}

const AuthThemeLite = memo<AuthThemeLiteProps>(({ children, globalCDN }) => {
  const isDark = useIsDark();
  const { i18n } = useTranslation();
  const currentAppearance = isDark ? 'dark' : 'light';
  const fontFamily = genFontFamily({ locale: i18n.language });
  const fontFamilyCode = genFontFamilyCode({ locale: i18n.language });

  return (
    <AntdStyleLayer>
      <ConfigProvider
        motion={m}
        config={{
          aAs: Link,
          imgAs: Image,
          imgUnoptimized: true,
          proxy: globalCDN ? 'unpkg' : undefined,
        }}
      >
        <ThemeProvider
          appearance={currentAppearance}
          className={'auth-layout'}
          defaultAppearance={currentAppearance}
          defaultThemeMode={currentAppearance}
          enableGlobalStyle={false}
          style={{ height: '100%' }}
          theme={{
            cssVar: { key: 'orvilo-vars' },
            token: {
              fontFamily,
              fontFamilyCode,
            },
          }}
        >
          <BaseGlobalStyle />
          <NativeThemeProvider
            appearance={currentAppearance}
            fontFamily={fontFamily}
            fontFamilyCode={fontFamilyCode}
          >
            <div className="h-full">
              <LazyMotion features={domMax}>{children}</LazyMotion>
              <ToastHost />
            </div>
          </NativeThemeProvider>
        </ThemeProvider>
      </ConfigProvider>
    </AntdStyleLayer>
  );
});

AuthThemeLite.displayName = 'AuthThemeLite';

export default AuthThemeLite;
