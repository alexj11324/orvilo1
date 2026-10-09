'use client';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { App } from 'antd';
import { domMax, LazyMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ToastHost } from '@/components/toast';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { useIsDark } from '@/hooks/useIsDark';
import AntdStyleLayer from '@/layout/GlobalProvider/AntdStyleLayer';
import Image from '@/libs/next/Image';
import Link from '@/libs/next/Link';
import { BaseGlobalStyle } from '@/styles';
import { ThemeRoles } from '@/styles/themeRoles';

interface AuthThemeLiteProps extends PropsWithChildren {
  globalCDN?: boolean;
}

const AuthThemeLite = memo<AuthThemeLiteProps>(({ children, globalCDN }) => {
  const isDark = useIsDark();
  const { i18n } = useTranslation();
  const currentAppearance = isDark ? 'dark' : 'light';

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
              fontFamily: genFontFamily({ locale: i18n.language }),
              fontFamilyCode: genFontFamilyCode({ locale: i18n.language }),
            },
          }}
        >
          <BaseGlobalStyle />
          <ThemeRoles />
          <App style={{ height: '100%' }}>
            <LazyMotion features={domMax}>{children}</LazyMotion>
            <ToastHost />
          </App>
        </ThemeProvider>
      </ConfigProvider>
    </AntdStyleLayer>
  );
});

AuthThemeLite.displayName = 'AuthThemeLite';

export default AuthThemeLite;
