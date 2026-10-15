'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { type ReactNode, useEffect } from 'react';
import { isRtlLang } from 'rtl-detect';

/** Direction is a native document and primitive contract. No extra DOM wrapper
 * or async locale boundary is inserted, so resolving locale never remounts UI. */
export function DocumentLocale({ language, children }: { language: string; children: ReactNode }) {
  const direction = isRtlLang(language) ? 'rtl' : 'ltr';
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const previousLanguage = root.lang;
    const previousDirection = root.getAttribute('dir');
    root.lang = language;
    root.dir = direction;
    return () => {
      if (root.lang === language) root.lang = previousLanguage;
      if (root.getAttribute('dir') === direction) {
        if (previousDirection === null) root.removeAttribute('dir');
        else root.setAttribute('dir', previousDirection);
      }
    };
  }, [language, direction]);
  return <DirectionProvider direction={direction}>{children}</DirectionProvider>;
}
