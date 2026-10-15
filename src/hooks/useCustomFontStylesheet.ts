import { useEffect } from 'react';

// MIT-derived FontLoader lifecycle; attribution: src/styles/nativeThemeSwatches.LICENSE.
// Default webfonts remain owned by the current theme provider. This hook owns
// only the explicit custom stylesheet selected by the document host.
export function useCustomFontStylesheet(url: string | undefined): void {
  useEffect(() => {
    if (!url) return;
    const element = document.createElement('link');
    element.rel = 'stylesheet';
    element.href = url;
    const handleError = () => console.error(`Failed to load font from ${url}`);
    element.addEventListener('error', handleError);
    document.head.append(element);
    return () => {
      element.removeEventListener('error', handleError);
      element.remove();
    };
  }, [url]);
}
