'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { ListTree } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors, threadSelectors } from '@/store/chat/selectors';

import type { CallSubAgentParams, CallSubAgentState } from '../../../types';

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
  resultBox: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
}));

/**
 * Render for orvilo-agent's `callSubAgent` tool.
 *
 * A sub-agent runs in an isolated Thread via the current runtime, so this view
 * shows the instruction sent to it plus its closing summary (the tool result),
 * and exposes a toggle to open / collapse that Thread in the portal. The Thread
 * is located by the `threadId` persisted in tool state; while the run is still
 * starting the lookup can return `undefined`, so the button is hidden rather
 * than rendered as a dead no-op.
 */
export const CallSubAgentRender = memo<
  BuiltinRenderProps<CallSubAgentParams, CallSubAgentState, string>
>(({ args, content, pluginState }) => {
  const { t } = useTranslation('plugin');
  const { t: tChat } = useTranslation('chat');
  const prompt = args?.instruction?.trim();
  const result = typeof content === 'string' ? content.trim() : '';
  const threadId = pluginState?.threadId;

  const subagentThread = useChatStore((s) =>
    threadId
      ? (threadSelectors.currentTopicThreads(s) ?? []).find((thread) => thread.id === threadId)
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

  if (!prompt && !result && !subagentThread) return null;

  const showResultSection = !!result || !!subagentThread;

  return (
    <div className={cn('flex', 'flex-col', 'gap-3', styles.container)}>
      {prompt && (
        <div className="flex flex-col">
          <div className={styles.label} style={{ marginBlockEnd: 4 }}>
            {t('builtins.orvilo-claude-code.agent.instruction')}
          </div>
          <div className={cn('flex', 'flex-col', styles.promptBox)}>
            <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
              {prompt}
            </Markdown>
          </div>
        </div>
      )}

      {showResultSection && (
        <div className="flex flex-col">
          <div className={cn('flex', 'items-center', 'justify-between', styles.labelRow)}>
            <div className={styles.label}>{t('builtins.orvilo-claude-code.agent.result')}</div>
            {subagentThread && (
              <Button
                className={styles.openThread}
                size="sm"
                variant="ghost"
                onClick={handleToggleThread}
              >
                <ListTree data-icon="inline-start" />{' '}
                {isOpenInPortal
                  ? tChat('thread.closeSubagentThread')
                  : tChat('thread.openSubagentThread')}
              </Button>
            )}
          </div>
          {result && (
            <div className={cn('flex', 'flex-col', styles.resultBox)}>
              <Markdown style={{ maxHeight: 320, overflow: 'auto' }} variant={'chat'}>
                {result}
              </Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

CallSubAgentRender.displayName = 'CallSubAgentRender';

export default CallSubAgentRender;
