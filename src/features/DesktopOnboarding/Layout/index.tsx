'use client';

import '@/app/globals.css';

import { BRANDING_NAME, COPYRIGHT_FULL } from '@orvilo/business-const';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { type CSSProperties, type PropsWithChildren } from 'react';

import { ProductLogo } from '@/components/Branding';
import SimpleTitleBar from '@/features/Electron/titlebar/SimpleTitleBar';
import LangButton from '@/features/User/UserPanel/LangButton';
import ThemeButton from '@/features/User/UserPanel/ThemeButton';
import { useIsDark } from '@/hooks/useIsDark';

interface OnboardingContainerProps extends PropsWithChildren {
  showHeader?: boolean;
}

const OnboardingContainer = ({ children, showHeader = true }: OnboardingContainerProps) => {
  const isDark = useIsDark();

  return (
    <div
      className="bg-background text-foreground flex h-full min-h-0 w-full flex-col"
      data-theme={isDark ? 'dark' : 'light'}
    >
      <SimpleTitleBar />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={
          {
            '--onboarding-viewport-height': `calc(100svh - ${TITLE_BAR_HEIGHT}px)`,
          } as CSSProperties
        }
      >
        {showHeader ? (
          <>
            <header className="flex shrink-0 items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6 lg:px-10">
              <div aria-label={BRANDING_NAME}>
                <ProductLogo size={28} type="combine" />
              </div>
              <div className="flex items-center gap-2">
                <LangButton compact placement="bottomRight" />
                <ThemeButton placement="bottomRight" size={18} />
              </div>
            </header>
            <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-8 sm:py-12">
              {children}
            </main>
            <footer className="text-muted-foreground shrink-0 px-6 py-6 text-center text-xs">
              {COPYRIGHT_FULL}
            </footer>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default OnboardingContainer;
