import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { AGENT_CHAT_TOPIC_URL, DEFAULT_AVATAR } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { confirmModal } from '@/components/Modal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import AgentList from '@/features/Home/AgentSelect/AgentList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useInitBuiltinAgent } from '@/hooks/useInitBuiltinAgent';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
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
 * - Open topic: picking an agent asks for a light confirm, rebinds the topic
 *   (recording the handoff marker), then moves the view to the new agent's
 *   room — the topic lives with its bound agent.
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

  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const title = agentDisplayName(meta, t('untitledAgent'));

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
        // key flips to the new agent's bucket.
        carryDraftToKey(messageMapKey(draftInput(agentId)), messageMapKey(draftInput(id)));
        useChatStore.setState({ composerAgentId: id }, false, 'composerAgent/switch');
        return;
      }

      // Open topic: switching hands the existing conversation to another
      // agent — a light confirm so the handoff is never silent.
      const toMeta = agentSelectors.getAgentMetaById(id)(useAgentStore.getState());
      const toName = agentDisplayName(toMeta, t('untitledAgent'));
      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('agentSwitchConfirm', { name: toName }),
        okText: t('agentSwitchConfirmAction', { name: toName }),
        onOk: async () => {
          carryDraftToKey(messageMapKey(draftInput(agentId)), messageMapKey(draftInput(id)));
          await rebindTopicAgent(activeTopicId, id);
          useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: id });
          useChatStore.getState().clearPortalStack();
          workspaceAwareNavigate(AGENT_CHAT_TOPIC_URL(id, activeTopicId));
        },
        title: t('agentSwitchConfirmTitle'),
      });
    },
    [agentId, t, workspaceAwareNavigate],
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
