'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ListTree } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors, threadSelectors } from '@/store/chat/selectors';

import type { AgentArgs } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-block: 4px;
  `,
  label: css`
    padding-inline-start: 4px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  labelRow: css`
    margin-block-end: 4px;
  `,
  openThread: css`
    height: 22px;
    padding-inline: 6px;
    font-size: 12px;
  `,
  promptBox: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillTertiary};
  `,
}));

/**
 * Streaming view for CC's `Agent` tool — shown while the subagent is still
 * running (args parsed, no tool_result yet). Mirrors `Render/Agent` but drops
 * the result block, since it hasn't arrived. If the executor has already
 * created the subagent Thread, surface the "open subtopic" toggle alongside
 * the instruction so the user can jump into the live subagent conversation.
 */
const AgentStreaming = memo<BuiltinStreamingProps<AgentArgs>>(({ args, toolCallId }) => {
  const { t } = useTranslation('plugin');
  const { t: tChat } = useTranslation('chat');
  const prompt = args?.prompt?.trim();

  const subagentThread = useChatStore((s) =>
    toolCallId
      ? (threadSelectors.currentTopicThreads(s) ?? []).find(
          (thread) => thread.metadata?.sourceToolCallId === toolCallId,
        )
      : undefined,
  );
  const openThreadInPortal = useChatStore((s) => s.openThreadInPortal);
  const closeThreadPortal = useChatStore((s) => s.closeThreadPortal);
  const portalThreadId = useChatStore(portalThreadSelectors.portalThreadId);
  const isOpenInPortal = !!subagentThread && portalThreadId === subagentThread.id;

  const handleToggleThread = useCallback(() => {
    if (!subagentThread) return;
    if (isOpenInPortal) {
      closeThreadPortal();
    } else {
      openThreadInPortal(subagentThread.id, subagentThread.sourceMessageId);
    }
  }, [subagentThread, isOpenInPortal, openThreadInPortal, closeThreadPortal]);

  if (!prompt && !subagentThread) return null;

  return (
    <div className={cx('flex flex-col gap-3', styles.container)}>
      {prompt && (
        <div className="flex flex-col">
          <div className={cx('flex flex-row items-center justify-between', styles.labelRow)}>
            <div className={cn(styles.label)}>
              {t('builtins.orvilo-claude-code.agent.instruction')}
            </div>
            {subagentThread && (
              <Button
                className={cn(styles.openThread)}
                size="sm"
                variant="ghost"
                onClick={handleToggleThread}
              >
                <ListTree data-icon="inline-start" />
                {isOpenInPortal
                  ? tChat('thread.closeSubagentThread')
                  : tChat('thread.openSubagentThread')}
              </Button>
            )}
          </div>
          <div className={cx('flex flex-col', styles.promptBox)}>
            <Markdown variant={'chat'}>{prompt}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
});

AgentStreaming.displayName = 'ClaudeCodeAgentStreaming';

export default AgentStreaming;
