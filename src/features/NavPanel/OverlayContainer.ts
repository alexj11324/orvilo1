import { createContext, useContext, useMemo } from 'react';

import { useServerConfigStore } from '@/store/serverConfig';

export const OverlayContainerContext = createContext<HTMLDivElement | null>(null);

interface OverlayPortalProps {
  container?: HTMLElement | null;
}

type OverlayPopoverPortalProps = OverlayPortalProps;

export const useOverlayContainer = () => {
  return useContext(OverlayContainerContext);
};

const useMobileOverlayContainer = () => {
  const mobile = useServerConfigStore((s) => s.isMobile);
  const container = useOverlayContainer();

  return useMemo(() => {
    if (!mobile || !container) return undefined;

    return container;
  }, [container, mobile]);
};

export const useOverlayDropdownPortalProps = (): OverlayPortalProps | undefined => {
  const container = useMobileOverlayContainer();

  return useMemo(() => {
    if (!container) return undefined;

    return { container };
  }, [container]);
};

export const useOverlayPopoverPortalProps = (): OverlayPopoverPortalProps | undefined => {
  const container = useMobileOverlayContainer();

  return useMemo(() => {
    if (!container) return undefined;

    return { container };
  }, [container]);
};
