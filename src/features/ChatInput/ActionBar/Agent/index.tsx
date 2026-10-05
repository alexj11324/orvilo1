import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { CHAT_TOPIC_URL } from '@orvilo/const';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { agentDisplayName } from '@orvilo/types';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';
import { openConnectAgentModal } from '@/features/ConnectAgent';
import { selectAgentForConversation } from '@/features/Conversation/selectAgent';
import AgentList from '@/features/Home/AgentSelect/AgentList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useInitBuiltinAgent } from '@/hooks/useInitBuiltinAgent';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { resolveAgentRuntimeType } from '@/utils/agentRuntimeIdentity';

import SelectorTrigger from '../../components/SelectorTrigger';
import { useAgentId } from '../../hooks/useAgentId';
import { useActionBarContext } from '../context';
import LocalHarnessSection from './LocalHarnessSection';

interface HandoffChoiceContentProps {
  agentName: string;
  onContinue: () => Promise<void>;
  onFork: () => Promise<void>;
}

/**
 * The agent pick on an open topic offers the two explicit handoff modes:
 * Continue reassigns this conversation's execution to the new agent (it keeps
 * its id, history and feed position); Fork seeds a new conversation from this
 * one bound to the new agent, leaving the original untouched.
 */
const HandoffChoiceContent = memo<HandoffChoiceContentProps>(
  ({ agentName, onContinue, onFork }) => {
    const { t } = useTranslation('chat');
    const { close } = useModalContext();
    const [pending, setPending] = useState<'continue' | 'fork' | null>(null);

    const run = (kind: 'continue' | 'fork', action: () => Promise<void>) => {
      if (pending) return;
      setPending(kind);
      action()
        .then(() => close())
        .catch((error: unknown) => {
          setPending(null);
          toast.error(error instanceof Error ? error.message : String(error));
        });
    };

    return (
      <>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{t('agentSwitchChoice.description')}</div>
        <ModalFooter>
          <Button disabled={!!pending} onClick={close}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button disabled={!!pending} variant="outline" onClick={() => run('fork', onFork)}>
            {t('agentSwitchChoice.fork', { name: agentName })}
          </Button>
          <Button
            disabled={!!pending}
            variant="default"
            onClick={() => run('continue', onContinue)}
          >
            {t('agentSwitchChoice.continue', { name: agentName })}
          </Button>
        </ModalFooter>
      </>
    );
  },
);

HandoffChoiceContent.displayName = 'HandoffChoiceContent';

/**
 * Agent chip — the agent-first replacement for the model picker in the
 * conversation composer. Shows the bound agent's avatar + display name and
 * opens the shared agent list.
 *
 * Topic-centric model — the agent is an execution attribute of the
 * conversation, not a room you navigate to:
 *
 * - Blank composer (no topic): picking an agent only re-targets the pending
 *   send — `composerAgentId` becomes the new topic's bound agent on first
 *   message. No navigation and no draft move: the blank composer's draft keys
 *   on the workspace, so the typed text stays on screen.
 * - Open topic: picking an agent offers Continue (reassign execution — the
 *   conversation keeps its id and history, drafts stay put since they key on
 *   topicId) or Fork (a new topic seeded from this one, bound to the agent),
 *   each behind a light confirmation.
 */
const Agent = memo(() => {
  const { t } = useTranslation('chat');
  const { dropdownPlacement } = useActionBarContext();
  const agentId = useAgentId();
  const [open, setOpen] = useState(false);
  const { error, mutate } = useFetchAgentList();
  const workspaceAwareNavigate = useWorkspaceAwareNavigate();
  // The task agent is a virtual row that never reaches the sidebar list — it
  // must be provisioned here so the dropdown can offer it (AgentList injects
  // it once `builtinAgentIdMap` resolves).
  useInitBuiltinAgent(BUILTIN_AGENT_SLUGS.taskAgent);

  const taskAgentId = useAgentStore(builtinAgentSelectors.taskAgentId);
  const runtimeType = useAgentStore((s) =>
    resolveAgentRuntimeType(agentSelectors.getAgentConfigById(agentId)(s)),
  );
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  // The task agent is a virtual row — its label comes from the same fallback
  // the task-manager selector uses, not the agent meta map.
  const title = agentDisplayName(
    meta,
    agentId === taskAgentId ? t('taskManager.agent', { ns: 'topic' }) : t('untitledAgent'),
  );

  const handleSelect = useCallback(
    (id: string) => {
      setOpen(false);
      if (!id || id === agentId) return;

      const { activeTopicId, rebindTopicAgent } = useChatStore.getState();

      if (!activeTopicId) {
        // Blank composer: the pick retargets the pending send, no navigation
        // and no draft carry — the blank composer's draft keys on the
        // workspace, so the typed text stays under the same key. An explicit
        // pick is also one of the three write points for `lastUsedAgentId`
        // (pick / send / handoff) — the shared explicit-select action keeps
        // the next blank composer's default on the agent the user last chose.
        selectAgentForConversation(id);
        return;
      }

      // Open topic: the pick offers the two explicit handoff modes — the
      // switch is never silent, and the copy says what each mode does.
      const toMeta = agentSelectors.getAgentMetaById(id)(useAgentStore.getState());
      const toName = agentDisplayName(
        toMeta,
        id === taskAgentId ? t('taskManager.agent', { ns: 'topic' }) : t('untitledAgent'),
      );
      const topicId = activeTopicId;
      createModal({
        content: (
          <HandoffChoiceContent
            agentName={toName}
            onContinue={async () => {
              // Continue reassigns execution only — the draft keys on the
              // topic id, so the typed text stays with the conversation, and
              // the canonical `/chat/:topicId` URL never changes either:
              // a handoff never navigates containers.
              await rebindTopicAgent(topicId, id);
              useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: id });
              useChatStore.getState().clearPortalStack();
            }}
            onFork={async () => {
              const newTopicId = await useChatStore.getState().forkTopicAgent(topicId, id);
              useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: id });
              useChatStore.getState().clearPortalStack();
              workspaceAwareNavigate(CHAT_TOPIC_URL(newTopicId));
            }}
          />
        ),
        footer: null,
        maskClosable: true,
        title: t('agentSwitchChoice.title', { name: toName }),
        width: 420,
      });
    },
    [agentId, t, taskAgentId, workspaceAwareNavigate],
  );

  /**
   * A locally detected harness the user has not connected yet. Picking it is
   * deliberately NOT a selection: it hands off to the connect wizard, which
   * owns naming, the target device and the explicit "Connect" confirmation.
   * Nothing is written from chat — that is the invariant this indirection
   * exists to protect, and why the row shows a 连接 affordance instead of
   * looking like the agent rows above.
   */
  const handleConnectHarness = useCallback((type: HeterogeneousAgentType) => {
    setOpen(false);
    openConnectAgentModal({ initialType: type });
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SelectorTrigger
            ariaLabel={title}
            leading={<AgentRuntimeIcon size={20} type={runtimeType} />}
            text={title}
          />
        }
      />
      <PopoverContent
        align={(dropdownPlacement ?? 'topRight').endsWith('Right') ? 'end' : 'start'}
        side={(dropdownPlacement ?? 'topRight').startsWith('top') ? 'top' : 'bottom'}
        style={{ padding: 0, width: 280 }}
      >
        <AgentList
          includeTaskAgent
          activeAgentId={agentId}
          // Desktop only: the probe goes through the Electron binary detector,
          // so on the web build there is no local machine to report on.
          error={error}
          bottomSection={
            heterogeneousAgentService.supportsLocalExecution ? (
              <LocalHarnessSection onConnect={handleConnectHarness} />
            ) : undefined
          }
          onRetry={() => mutate()}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
});

Agent.displayName = 'Agent';

export default Agent;
