'use client';

import { BRANDING_NAME, COPYRIGHT_FULL } from '@orvilo/business-const';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { type CSSProperties, type PropsWithChildren } from 'react';

import { ProductLogo } from '@/components/Branding';
import { EntryShell } from '@/features/AuthShell/EntryShell';
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
          <EntryShell
            className="min-h-full shrink-0"
            footer={COPYRIGHT_FULL}
            actions={
              <>
                <LangButton compact placement="bottomRight" />
                <ThemeButton placement="bottomRight" size={18} />
              </>
            }
            brand={
              <div aria-label={BRANDING_NAME}>
                <ProductLogo size={28} type="combine" />
              </div>
            }
          >
            {children}
          </EntryShell>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default OnboardingContainer;
