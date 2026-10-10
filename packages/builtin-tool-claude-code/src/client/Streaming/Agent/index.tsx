'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { clsx as cx, cn } from 'cn';
import { ListTree } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors, threadSelectors } from '@/store/chat/selectors';

import type { AgentArgs } from '../../../types';

const styles = {
  container: 'py-1',
  label: 'ps-1 text-xs leading-5 text-muted-foreground',
  labelRow: 'mb-1',
  promptBox: 'rounded-(--radius-card) bg-muted px-3 py-2',
};

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
              <Button size="compact" variant="ghost" onClick={handleToggleThread}>
                <ListTree data-icon="inline-start" />
                {isOpenInPortal
                  ? tChat('thread.closeSubagentThread')
                  : tChat('thread.openSubagentThread')}
              </Button>
            )}
          </div>
          <div className={cx('flex flex-col', styles.promptBox)}>
            <Markdown fontSize={14} variant={'chat'}>
              {prompt}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
});

AgentStreaming.displayName = 'ClaudeCodeAgentStreaming';

export default AgentStreaming;
