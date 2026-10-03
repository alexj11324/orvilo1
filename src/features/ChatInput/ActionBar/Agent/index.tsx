import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { AGENT_CHAT_TOPIC_URL, DEFAULT_AVATAR } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { selectAgentForConversation } from '@/features/Conversation/selectAgent';
import AgentList from '@/features/Home/AgentSelect/AgentList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useInitBuiltinAgent } from '@/hooks/useInitBuiltinAgent';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { useGlobalStore } from '@/store/global';

import SelectorTrigger from '../../components/SelectorTrigger';
import { getDraft, removeDraft, saveDraft } from '../../draftStorage';
import { useAgentId } from '../../hooks/useAgentId';
import { useActionBarContext } from '../context';

/**
 * Move the composer draft stored under one conversation key to another so the
 * in-progress text follows the agent switch instead of staying behind under
 * the old agent's bucket.
 */
const carryDraftToKey = (fromKey: string, toKey: string) => {
  if (fromKey === toKey) return;
  const draft = getDraft(fromKey);
  if (!draft) return;
  saveDraft(toKey, draft);
  removeDraft(fromKey);
};

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
 *   message. No navigation; the draft is carried to the new agent's bucket.
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
      const draftInput = (targetAgentId: string) => ({
        agentId: targetAgentId,
        topicId: activeTopicId ?? undefined,
      });

      if (!activeTopicId) {
        // Blank composer: the pick retargets the pending send, no navigation —
        // carrying the draft keeps the typed text on screen while the draft
        // key flips to the new agent's bucket. An explicit pick is also one of
        // the three write points for `lastUsedAgentId` (pick / send / handoff)
        // — the shared explicit-select action keeps the next blank composer's
        // default on the agent the user last chose.
        carryDraftToKey(messageMapKey(draftInput(agentId)), messageMapKey(draftInput(id)));
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
              // topic id, so the typed text stays with the conversation.
              await rebindTopicAgent(topicId, id);
              useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: id });
              useChatStore.getState().clearPortalStack();
              workspaceAwareNavigate(AGENT_CHAT_TOPIC_URL(id, topicId));
            }}
            onFork={async () => {
              const newTopicId = await useChatStore.getState().forkTopicAgent(topicId, id);
              useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: id });
              useChatStore.getState().clearPortalStack();
              workspaceAwareNavigate(AGENT_CHAT_TOPIC_URL(id, newTopicId));
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SelectorTrigger
            ariaLabel={title}
            text={title}
            leading={
              <Avatar
                avatar={meta.avatar || DEFAULT_AVATAR}
                background={meta.backgroundColor}
                name={title}
                shape={'square'}
                size={20}
              />
            }
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
          error={error}
          onRetry={() => mutate()}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
});

Agent.displayName = 'Agent';

export default Agent;
