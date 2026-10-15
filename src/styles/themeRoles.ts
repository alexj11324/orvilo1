'use client';

import { ThemeContext } from '@emotion/react';
import { createElement, type ReactNode, use } from 'react';

import type { ResolvedDocumentTheme } from './resolvedThemeContract';
import { ResolvedThemeRoles } from './resolvedThemeRoles';

export * from './resolvedThemeRoles';

/** Compatibility bridge for retained SDK theme hosts. Native hosts import the
 * local role owner directly and never enter Emotion or SDK ThemeProvider. */
export function ThemeRoles({ children }: { children?: ReactNode }) {
  const theme = use(ThemeContext) as ResolvedDocumentTheme;
  return createElement(ResolvedThemeRoles, { theme }, children);
}
