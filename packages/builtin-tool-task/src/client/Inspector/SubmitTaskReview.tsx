'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles } from '@/styles';

import type { SubmitTaskReviewParams, SubmitTaskReviewState } from '../../types';

export const SubmitTaskReviewInspector = ({
  args,
  partialArgs,
}: BuiltinInspectorProps<SubmitTaskReviewParams, SubmitTaskReviewState>) => {
  const { t } = useTranslation('plugin');
  const identifier = args?.identifier ?? partialArgs?.identifier;
  return (
    <div className={inspectorTextStyles.root}>
      <span>{t('builtins.orvilo-task.apiName.submitTaskReview')}</span>
      {identifier && <span className="ms-1.5 text-muted-foreground">{identifier}</span>}
    </div>
  );
};
