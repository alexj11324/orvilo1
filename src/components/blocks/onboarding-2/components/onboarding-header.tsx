import { ArrowLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { OnboardingLogo } from './onboarding-logo';

export function OnboardingHeader({
  canGoBack,
  onBack,
}: {
  canGoBack: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation('onboarding');

  return (
    <header className="relative z-10 flex min-h-8 shrink-0 items-center justify-between gap-4">
      <OnboardingLogo />

      {canGoBack ? (
        <Button
          aria-label={t('reui.action.backAria')}
          size="sm"
          type="button"
          variant="ghost"
          onClick={onBack}
        >
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('reui.action.back')}
        </Button>
      ) : null}
    </header>
  );
}
