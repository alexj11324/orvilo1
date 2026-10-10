'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { CreateAgentParams } from '../../../types';

export const CreateAgentInspector = memo<BuiltinInspectorProps<CreateAgentParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const title = args?.title || partialArgs?.title;
    const avatar = args?.avatar || partialArgs?.avatar;
    const backgroundColor = args?.backgroundColor || partialArgs?.backgroundColor;

    if (isArgumentsStreaming && !title) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.createAgent')}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-row items-center gap-2 overflow-hidden">
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-muted-foreground',
            isArgumentsStreaming && shinyTextStyles.shinyText,
          )}
        >
          {t('builtins.orvilo-agent-management.inspector.createAgent.title')}
        </span>
        <Avatar
          avatar={avatar || DEFAULT_AVATAR}
          background={backgroundColor || 'var(--card)'}
          shape={'square'}
          size={24}
          title={title || undefined}
        />
        {title && <span className={highlightTextStyles.primary}>{title}</span>}
      </div>
    );
  },
);

CreateAgentInspector.displayName = 'CreateAgentInspector';

export default CreateAgentInspector;
