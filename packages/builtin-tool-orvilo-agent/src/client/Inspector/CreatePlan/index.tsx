'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { clsx as cx } from 'cn';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { CreatePlanParams, CreatePlanState } from '../../../types';

export const CreatePlanInspector = memo<BuiltinInspectorProps<CreatePlanParams, CreatePlanState>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const orchestrationWorkflow = args?.orchestrationWorkflow || partialArgs?.orchestrationWorkflow;

    if (isArgumentsStreaming && !orchestrationWorkflow) {
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent.apiName.createPlan')}
          </span>
        </div>
      );
    }

    return (
      <div
        className={cx(inspectorTextStyles.root, isArgumentsStreaming && shinyTextStyles.shinyText)}
      >
        {orchestrationWorkflow ? (
          <Trans
            components={{ orchestrationWorkflow: <span className={highlightTextStyles.primary} /> }}
            i18nKey="builtins.orvilo-agent.apiName.createPlan.result"
            ns="plugin"
            values={{ orchestrationWorkflow }}
          />
        ) : (
          <span>{t('builtins.orvilo-agent.apiName.createPlan')}</span>
        )}
      </div>
    );
  },
);

CreatePlanInspector.displayName = 'CreatePlanInspector';

export default CreatePlanInspector;
