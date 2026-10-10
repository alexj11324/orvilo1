'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { CodexCollabToolArgs, CodexCollabToolState } from './collabToolUtils';
import {
  formatCollabStatus,
  getCollabAgentEntries,
  getCollabPrompt,
  getCollabStatusTone,
} from './collabToolUtils';

const styles = {
  agentHeader: 'text-xs leading-5 text-muted-foreground',
  agentRow: 'border-b border-divider px-3 py-2 text-sm leading-5.5 last:border-b-0',
  promptBox: 'rounded-(--radius-card) bg-muted px-3 py-2',
  sectionLabel: 'mb-1 text-xs leading-5 text-muted-foreground',
  statusDot: 'size-1.5 flex-none rounded-full bg-muted-foreground',
  statusDotError: 'bg-destructive-text',
  statusDotProcessing: 'bg-info-text',
  statusDotSuccess: 'bg-success-text',
};

const STATUS_DOT_CLASS = {
  error: styles.statusDotError,
  muted: undefined,
  processing: styles.statusDotProcessing,
  success: styles.statusDotSuccess,
};

const CollabToolRender = memo<
  BuiltinRenderProps<CodexCollabToolArgs, CodexCollabToolState, string>
>(({ args, pluginState }) => {
  const { t } = useTranslation('plugin');
  const prompt = getCollabPrompt(args, pluginState);
  const agents = getCollabAgentEntries(args, pluginState);

  if (!prompt && agents.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {prompt && (
        <div>
          <div className={styles.sectionLabel}>
            {t('builtins.codex.collabTool.instruction', { defaultValue: 'Instruction' })}
          </div>
          <div className={cn('flex', 'flex-col', styles.promptBox)}>
            <Markdown fontSize={14} style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
              {prompt}
            </Markdown>
          </div>
        </div>
      )}
      {agents.length > 0 && (
        <div>
          <div className={styles.sectionLabel}>
            {t('builtins.codex.collabTool.agents', { defaultValue: 'Subagents' })}
          </div>
          <div className="flex flex-col gap-2">
            {agents.map((agent, index) => (
              <div className={cn('flex', 'flex-col', 'gap-1', styles.agentRow)} key={agent.id}>
                <div className={cn('flex', 'items-center', 'gap-1.5', styles.agentHeader)}>
                  <span
                    className={cn(
                      styles.statusDot,
                      STATUS_DOT_CLASS[getCollabStatusTone(agent.status)],
                    )}
                  />
                  <span>
                    {t('builtins.codex.collabTool.agentLabel', {
                      defaultValue: 'Subagent {{index}}',
                      index: index + 1,
                    })}
                  </span>
                  {agent.status && <span>· {formatCollabStatus(agent.status)}</span>}
                </div>
                {agent.message && (
                  <Markdown
                    fontSize={14}
                    style={{ maxHeight: 320, overflow: 'auto' }}
                    variant={'chat'}
                  >
                    {agent.message}
                  </Markdown>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

CollabToolRender.displayName = 'CodexCollabToolRender';

export default CollabToolRender;
