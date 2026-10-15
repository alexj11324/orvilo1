'use client';

import { domMax, LazyMotion } from 'motion/react';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import CdnWebFonts from '@/components/CdnWebFonts';
import { ToastHost } from '@/components/toast';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { useIsDark } from '@/hooks/useIsDark';
import { BaseGlobalStyle } from '@/styles';
import { ThemeRoles } from '@/styles/themeRoles';

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
    <div className="auth-layout" style={{ height: '100%', isolation: 'isolate' }}>
      <CdnWebFonts globalCDN={globalCDN} />
      <BaseGlobalStyle />
      <ThemeRoles
        appearance={currentAppearance}
        fontFamily={fontFamily}
        fontFamilyCode={fontFamilyCode}
      >
        <div className="h-full">
          <LazyMotion features={domMax}>{children}</LazyMotion>
          <ToastHost />
        </div>
      </ThemeRoles>
    </div>
  );
});

AuthThemeLite.displayName = 'AuthThemeLite';

export default AuthThemeLite;
