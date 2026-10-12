import { useLayoutEffect, useState } from 'react';

import { useResolvedLargeMinWidth, useResolvedMobileMaxWidth } from '@/styles/themeRoles';

function useViewportMediaQuery(query: string, serverSnapshot: boolean): boolean {
  const [matches, setMatches] = useState(serverSnapshot);
  useLayoutEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    update();
    return () => {
      if (typeof media.removeEventListener === 'function')
        media.removeEventListener('change', update);
    };
  }, [query]);
  return matches;
}

export const useIsMobile = (): boolean => {
  const mobileMaxWidth = useResolvedMobileMaxWidth();
  return useViewportMediaQuery(`(max-width: ${mobileMaxWidth}px)`, false);
};

// Existing document menus default lg=true during server/first rendering.
// "Large" names the actual screenLG viewport role, not a platform or mobile inverse.
export const useIsLargeViewport = (): boolean => {
  const largeMinWidth = useResolvedLargeMinWidth();
  return useViewportMediaQuery(`(min-width: ${largeMinWidth}px)`, true);
};
