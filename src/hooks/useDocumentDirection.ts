import { useEffect } from 'react';
import { isRtlLang } from 'rtl-detect';

/**
 * Keeps `<html dir>` in step with the active language. Components use logical
 * properties, so the document direction is the only direction switch.
 */
export const useDocumentDirection = (lang?: string) => {
  useEffect(() => {
    if (!lang || typeof document === 'undefined') return;
    document.documentElement.dir = isRtlLang(lang) ? 'rtl' : 'ltr';
  }, [lang]);
};
