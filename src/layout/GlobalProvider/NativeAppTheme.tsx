'use client';

import '@/styles/fonts.css';

import type { ReactNode } from 'react';

import { BaseGlobalStyle, GlobalStyle } from '@/styles';
import type { NativeThemeOptions } from '@/styles/nativeTheme';

import { NativeThemeProvider } from './NativeThemeProvider';

/** Actual default AppTheme's document semantic composition. Preferences, fonts,
 * cookie effects and retained compatibility config remain with that real host.
 * No DOM wrapper: AppTheme retains its established App layout class. */
export function NativeAppTheme({
  children,
  ...options
}: NativeThemeOptions & { children?: ReactNode }) {
  return (
    <NativeThemeProvider {...options}>
      <BaseGlobalStyle />
      <GlobalStyle />
      {children}
    </NativeThemeProvider>
  );
}
