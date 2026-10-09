'use client';

import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversationStore } from '@/features/Conversation';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    padding-block: 8px;
    padding-inline: 16px;
    border-radius: 48px;
  `,
  cardDisabled: css`
    cursor: not-allowed;
    opacity: 0.55;
  `,
  container: css`
    padding-block: 0;
    padding-inline: 0;
  `,
  title: css`
    color: ${cssVar.colorTextDescription};
  `,
}));

interface OpeningQuestionsProps {
  questions: string[];
}

const OpeningQuestions = memo<OpeningQuestionsProps>(({ questions }) => {
  const { t } = useTranslation(['welcome', 'chat']);
  const fillInputMessage = useConversationStore((s) => s.fillInputMessage);

  // Same per-resource General-access gating as the chat input below (see
  // useChatInputResourceAccess): inbox and private agents are never gated.
  const agentId = useAgentStore((s) => s.activeAgentId);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const agentVisibility = useAgentStore((s) =>
    s.activeAgentId ? s.agentMap[s.activeAgentId]?.visibility : undefined,
  );
  const gatedResourceId =
    agentId && agentId !== inboxAgentId && agentVisibility !== 'private' ? agentId : undefined;
  const { canUseResource } = useResourceAccess('agent', gatedResourceId);

  return (
    <div className={styles.container}>
      <p className={styles.title}>{t('guide.questions.title')}</p>
      <div className="flex gap-2 flex-wrap">
        {questions.slice(0, 5).map((question) => {
          const card = (
            <div
              {...clickableProps(canUseResource)}
              key={question}
              className={cn(
                `flex flex-col cursor-pointer ${cx(styles.card, !canUseResource && styles.cardDisabled)}`,
                CLICKABLE_FOCUS_RING,
              )}
              style={{
                paddingBlock: 8,
                paddingInline: 12,
                background: 'var(--ant-color-fill-secondary)',
              }}
              onClick={
                canUseResource
                  ? () => {
                      fillInputMessage(question);
                    }
                  : undefined
              }
            >
              {question}
            </div>
          );

          return canUseResource ? (
            card
          ) : (
            <Tooltip key={question}>
              <TooltipTrigger render={<span>{card}</span>} />
              <TooltipContent>{t('input.viewOnlyAgent', { ns: 'chat' })}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export default OpeningQuestions;
