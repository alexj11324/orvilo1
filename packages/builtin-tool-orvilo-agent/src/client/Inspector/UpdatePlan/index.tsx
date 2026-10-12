'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { CheckCircle, DiffIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { oneLineEllipsis, shinyTextStyles } from '@/styles';

import type { UpdatePlanParams, UpdatePlanState } from '../../../types';

const styles = {
  title: 'me-2 text-foreground',
};

export const UpdatePlanInspector = memo<BuiltinInspectorProps<UpdatePlanParams, UpdatePlanState>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const planId = args?.planId || partialArgs?.planId;
    const completed = args?.completed;
    const hasUpdates = args?.goal || args?.description || args?.context;

    if (isArgumentsStreaming && !planId) {
      return (
        <div className={cn(oneLineEllipsis, 'text-sm leading-5.5')}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent.apiName.updatePlan')}
          </span>
        </div>
      );
    }

    return (
      <div className={cn(oneLineEllipsis, 'text-sm leading-5.5')}>
        <span className={cn(styles.title, isArgumentsStreaming && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-agent.apiName.updatePlan')}
        </span>
        {completed && (
          <span className="rounded-(--radius-chip) bg-muted px-1 text-xs leading-5 text-success-text">
            <CheckCircle size={12} />
            {t('builtins.orvilo-agent.apiName.updatePlan.completed')}
          </span>
        )}
        {hasUpdates && !completed && (
          <span className="rounded-(--radius-chip) bg-muted px-1 text-xs leading-5 text-warning-text">
            <DiffIcon size={12} />
            {t('builtins.orvilo-agent.apiName.updatePlan.modified')}
          </span>
        )}
      </div>
    );
  },
);

UpdatePlanInspector.displayName = 'UpdatePlanInspector';

export default UpdatePlanInspector;
