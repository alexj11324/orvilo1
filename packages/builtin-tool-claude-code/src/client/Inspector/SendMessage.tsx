'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SendMessageArgs } from '../../types';

const styles = {
  chip: 'overflow-hidden inline-flex shrink items-center min-w-0 ms-1.5 py-px px-2 rounded-[999px] text-[12px] text-foreground text-ellipsis whitespace-nowrap bg-accent',
};

/**
 * Chip for the multi-agent `SendMessage` tool. Leads with the human-readable
 * `summary` (falling back to the message body) rather than the opaque agent id
 * from `to`/`recipient`, which means nothing to an end user.
 */
export const SendMessageInspector = memo<BuiltinInspectorProps<SendMessageArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t('builtins.orvilo-claude-code.sendMessage.title');
    const source = args ?? partialArgs;
    const recap = (source?.summary ?? source?.message ?? source?.content)?.trim();

    const isShiny = isArgumentsStreaming || isLoading;

    if (isArgumentsStreaming && !recap) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isShiny && shinyTextStyles.shinyText)}>
          {recap ? `${label}:` : label}
        </span>
        {recap && <span className={styles.chip}>{recap}</span>}
      </div>
    );
  },
);

SendMessageInspector.displayName = 'ClaudeCodeSendMessageInspector';
