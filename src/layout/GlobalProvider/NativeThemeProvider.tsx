'use client';

import { type ReactNode, useMemo } from 'react';

import { type NativeThemeOptions, resolveNativeTheme } from '@/styles/nativeTheme';
import { createThemeRoleStyles, ResolvedThemeRoles } from '@/styles/resolvedThemeRoles';

/** Both theme sheets are rendered on the server. The existing next-themes
 * data-theme attribute selects first-paint colors without a layout effect,
 * while the context follows the caller's resolved document appearance. */
export function NativeThemeProvider({
  children,
  appearance,
  primaryColor,
  neutralColor,
  fontFamily,
  fontFamilyCode,
  animationMode,
}: NativeThemeOptions & { children: ReactNode }) {
  const light = useMemo(
    () =>
      resolveNativeTheme({
        appearance: 'light',
        primaryColor,
        neutralColor,
        fontFamily,
        fontFamilyCode,
        animationMode,
      }),
    [primaryColor, neutralColor, fontFamily, fontFamilyCode, animationMode],
  );
  const dark = useMemo(
    () =>
      resolveNativeTheme({
        appearance: 'dark',
        primaryColor,
        neutralColor,
        fontFamily,
        fontFamilyCode,
        animationMode,
      }),
    [primaryColor, neutralColor, fontFamily, fontFamilyCode, animationMode],
  );
  return (
    <ResolvedThemeRoles emitStyle={false} theme={appearance === 'dark' ? dark : light}>
      <style data-orvilo-native-theme="">
        {createThemeRoleStyles(light) + createThemeRoleStyles(dark)}
      </style>
      {children}
    </ResolvedThemeRoles>
  );
}
