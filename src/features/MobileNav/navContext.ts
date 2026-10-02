import { createContext, useContext } from 'react';

/**
 * Whether the mobile bottom tab bar is rendered on the current route.
 * Nested layouts pad their scroll content by the bar's height only when the
 * bar actually overlays them — `isMobileNavRoute` decides, this context
 * carries the verdict so route logic isn't re-derived in feature code.
 */
export const MobileNavVisibleContext = createContext(false);

export const useMobileNavVisible = () => useContext(MobileNavVisibleContext);
