'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { CheckCircle2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

export const FinishOnboardingInspector = memo<
  BuiltinInspectorProps<Record<string, never>, Record<string, unknown>>
>(({ isArgumentsStreaming, isLoading, result }) => {
  const { t } = useTranslation('plugin');
  const succeeded = !!result && !result.error;

  return (
    <div className={inspectorTextStyles.root} style={{ gap: 6 }}>
      <span className={isArgumentsStreaming || isLoading ? shinyTextStyles.shinyText : ''}>
        {t('builtins.orvilo-web-onboarding.apiName.finishOnboarding')}
      </span>
      {succeeded && <CheckCircle2 className="text-success" size={14} />}
    </div>
  );
});

FinishOnboardingInspector.displayName = 'FinishOnboardingInspector';

export default FinishOnboardingInspector;
