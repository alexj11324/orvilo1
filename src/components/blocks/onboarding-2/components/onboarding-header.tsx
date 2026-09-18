import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { OnboardingLogo } from './onboarding-logo';

export function OnboardingHeader({
  canGoBack,
  onBack,
}: {
  canGoBack: boolean;
  onBack: () => void;
}) {
  return (
    <header className="relative z-10 flex min-h-8 shrink-0 items-center justify-between gap-4">
      <OnboardingLogo />

      {canGoBack ? (
        <Button
          aria-label="Back to previous step"
          size="sm"
          type="button"
          variant="ghost"
          onClick={onBack}
        >
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          Back
        </Button>
      ) : null}
    </header>
  );
}
