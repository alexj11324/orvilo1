'use client';

import { createStaticStyles, cx, responsive } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversationStore } from '@/features/Conversation';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    padding-block: 8px;
    padding-inline: 16px;
    border-radius: 48px;

    ${responsive.sm} {
      padding-block: 8px;
      padding-inline: 16px;
    }
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
  mobile?: boolean;
  questions: string[];
}

const OpeningQuestions = memo<OpeningQuestionsProps>(({ mobile, questions }) => {
  const { t } = useTranslation(['welcome', 'chat']);
  const fillInputMessage = useConversationStore((s) => s.fillInputMessage);

  // Same per-resource General-access gating as the chat input (see
  // useChatInputResourceAccess): private groups are never gated.
  const activeGroup = useAgentGroupStore((s) =>
    s.activeGroupId ? agentGroupSelectors.getGroupById(s.activeGroupId)(s) : undefined,
  );
  const gatedResourceId =
    activeGroup && activeGroup.visibility !== 'private' ? activeGroup.id : undefined;
  const { canUseResource } = useResourceAccess('agentGroup', gatedResourceId);

  return (
    <div className={styles.container}>
      <p className={styles.title}>{t('guide.questions.title')}</p>
      <div className="flex gap-2 flex-wrap">
        {questions.slice(0, mobile ? 2 : 5).map((question) => {
          const card = (
            <div
              key={question}
              style={{ cursor: 'pointer', background: cssVar.colorFillSecondary }}
              className={cn(
                'flex flex-col py-2 px-3',
                cx(styles.card, !canUseResource && styles.cardDisabled),
              )}
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<span style={{ display: 'inline-flex' }}>{card}</span>} />
                <TooltipContent>{t('input.viewOnlyGroup', { ns: 'chat' })}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
});

export default OpeningQuestions;
