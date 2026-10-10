'use client';

import { type FC, type PropsWithChildren, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';

import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';

const Container: FC<PropsWithChildren> = ({ children }) => {
  // This layout outlives a provider switch, so its scroll box keeps whatever
  // offset the previous provider was left at and the next one opens partway
  // down the page. Keyed on pathname rather than the route param: `:providerId`
  // is matched by the child route, so it is not visible from this layout.
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Before paint, so switching providers never flashes the old offset.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <NavHeader />
      <SettingContainer
        paddingBlock={24}
        paddingInline={24}
        ref={scrollRef}
        width="wide"
        style={{
          minHeight: '100%',
        }}
      >
        {children}
      </SettingContainer>
    </div>
  );
};
export default Container;
