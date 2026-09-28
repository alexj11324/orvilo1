import { ArrowLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import LangButton from '@/features/User/UserPanel/LangButton';
import ThemeButton from '@/features/User/UserPanel/ThemeButton';

import { OnboardingLogo } from './onboarding-logo';

export function OnboardingHeader({
  canGoBack,
  currentStep,
  onBack,
  statusLabel,
  totalSteps,
}: {
  canGoBack: boolean;
  currentStep: number;
  onBack: () => void;
  statusLabel?: string;
  totalSteps: number;
}) {
  const { t } = useTranslation('onboarding');

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
      <div className="relative flex min-w-0 items-center pl-7">
        {canGoBack ? (
          <Button
            aria-label={t('reui.action.backAria')}
            className="absolute top-1/2 left-0 shrink-0 -translate-y-1/2"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={onBack}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
        ) : null}
        <OnboardingLogo />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <LangButton compact placement="bottomRight" />
        <ThemeButton placement="bottomRight" size={18} />
        <span className="text-muted-foreground ml-1 hidden text-sm font-medium sm:inline">
          {statusLabel ?? t('reui.stepper.counter', { current: currentStep, total: totalSteps })}
        </span>
      </div>
    </header>
  );
}
