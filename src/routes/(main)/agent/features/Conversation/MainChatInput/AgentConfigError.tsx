'use client';

import { CircleAlertIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { contextSelectors, useConversationStore } from '@/features/Conversation/store';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

const styles = {
  description: 'mbs-0.5',
  retry: 'self-center ps-3',
} as const;

/**
 * Surfaces an agent-config fetch failure above the chat input with a retry
 * button. Only shown when the config is still missing (`isAgentConfigLoading`)
 * — a failed background revalidation over cached data stays silent.
 *
 * Wrapped in the composer's own `WideScreenContainer` so its edges land on the
 * input's edges — without it the alert is a plain sibling of `ChatInput` and
 * spills wider than the input on both sides. No extra inline padding: the
 * container's 16px is what the composer itself sits on. The bottom padding
 * absorbs the `skipScrollMarginWithList` -12px pull `MainChatInput` puts on the
 * composer, leaving the ~6px gap the other composer notices have.
 */
const AgentConfigError = memo(() => {
  const { t } = useTranslation('chat');
  const agentId = useConversationStore(contextSelectors.agentId);
  const errorMessage = useAgentStore(agentByIdSelectors.getAgentConfigErrorById(agentId));
  const isConfigMissing = useAgentStore(agentByIdSelectors.isAgentConfigLoadingById(agentId));
  const retryAgentConfigFetch = useAgentStore((s) => s.retryAgentConfigFetch);

  if (!errorMessage || !isConfigMissing) return null;

  return (
    <WideScreenContainer>
      <div className="flex flex-col pbs-0 pbe-4.5">
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t('agentConfigError.title')}</AlertTitle>
          <AlertDescription className={styles.description}>{errorMessage}</AlertDescription>
          <AlertAction className={styles.retry}>
            <Button size="lg" variant="outline" onClick={() => retryAgentConfigFetch(agentId)}>
              {t('agentConfigError.retry')}
            </Button>
          </AlertAction>
        </Alert>
      </div>
    </WideScreenContainer>
  );
});

AgentConfigError.displayName = 'AgentConfigError';

export default AgentConfigError;
