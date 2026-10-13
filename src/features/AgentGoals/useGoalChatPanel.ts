import { useState } from 'react';

interface ConversationTarget {
  agentId: string;
  topicId: string;
}

interface PanelState {
  open: boolean;
  orchestrationWorkflowId: string;
  request: number;
  target?: ConversationTarget;
}

/** Keep the selected conversation within this goal's inspection session. */
export const useGoalChatPanel = (orchestrationWorkflowId: string, responsibleAgentId?: string) => {
  const [state, setState] = useState<PanelState>({
    orchestrationWorkflowId,
    open: false,
    request: 0,
  });
  const current: PanelState =
    state.orchestrationWorkflowId === orchestrationWorkflowId
      ? state
      : { orchestrationWorkflowId, open: false, request: 0 };

  if (state.orchestrationWorkflowId !== orchestrationWorkflowId) setState(current);

  return {
    agentId: current.target?.agentId ?? responsibleAgentId,
    open: current.open,
    // Re-entering supervision must restore its topic even after browsing history
    // or starting another conversation in the same agent's panel.
    openSupervision: (target: ConversationTarget) => {
      setState({ orchestrationWorkflowId, open: true, request: current.request + 1, target });
    },
    request: current.request,
    setOpen: (open: boolean) => setState({ ...current, open }),
    topicId: current.target?.topicId,
  };
};
