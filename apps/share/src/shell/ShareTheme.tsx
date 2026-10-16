'use client';

import '@/app/globals.css';

import { domMax, LazyMotion } from 'motion/react';
import { memo, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import CdnWebFonts from '@/components/CdnWebFonts';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { useIsDark } from '@/hooks/useIsDark';
import { BaseGlobalStyle } from '@/styles';
import { ThemeRoles } from '@/styles/themeRoles';

const layoutStyle = {
  height: '100%',
  isolation: 'isolate',
  minHeight: '100dvh',
  width: '100%',
} as const;

const ShareTheme = memo<PropsWithChildren>(({ children }) => {
  const isDark = useIsDark();
  const { i18n } = useTranslation();
  const appearance = isDark ? 'dark' : 'light';
  const fontFamily = genFontFamily({ locale: i18n.language });
  const fontFamilyCode = genFontFamilyCode({ locale: i18n.language });

  return (
    <div className="share-layout" style={layoutStyle}>
      <CdnWebFonts />
      {/* The vendor ThemeProvider used to inject its document reset here. */}
      <BaseGlobalStyle />
      <ThemeRoles appearance={appearance} fontFamily={fontFamily} fontFamilyCode={fontFamilyCode}>
        <div className="h-full">
          <LazyMotion features={domMax}>{children}</LazyMotion>
        </div>
      </ThemeRoles>
    </div>
  );
});

ShareTheme.displayName = 'ShareTheme';

export default ShareTheme;
