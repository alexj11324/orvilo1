import type { ChatTopicMetadata, UIChatMessage } from '@orvilo/types';

import type { SteerContinuation } from '../../store/slices/data/steerChains';
import { collectSteerChains } from '../../store/slices/data/steerChains';

export type AgentHandoff = NonNullable<ChatTopicMetadata['agentHandoffs']>[number];

export interface ChatRow {
  continuations?: SteerContinuation[];
  id: string;
  /**
   * In-flow separator rows (no backing message). `agentHandoff` marks the
   * point the topic's bound agent changed so the handoff is never silent.
   */
  marker?: { kind: 'agentHandoff'; toAgentId: string };
}

const markerRow = (handoff: AgentHandoff): ChatRow => ({
  id: `agent-handoff-${handoff.at}-${handoff.toAgentId}`,
  marker: { kind: 'agentHandoff', toAgentId: handoff.toAgentId },
});

/**
 * Flatten the display message list into renderable rows, folding steered
 * continuations into their host turn and interleaving agent-handoff markers at
 * the message boundary each handoff falls on (before the first message newer
 * than the handoff, or after the last one when the switch is still the tail).
 */
export const buildChatRows = (
  messages: UIChatMessage[],
  handoffs: AgentHandoff[] = [],
): ChatRow[] => {
  const { byHost, hostOf } = collectSteerChains(messages);
  const rows: ChatRow[] = [];
  const pending = [...handoffs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const flushDue = (messageCreatedAt: number) => {
    while (pending.length && Date.parse(pending[0].at) < messageCreatedAt) {
      rows.push(markerRow(pending.shift()!));
    }
  };

  for (const message of messages) {
    if (hostOf.has(message.id)) continue;
    flushDue(message.createdAt);
    const chain = byHost.get(message.id);
    rows.push(chain ? { continuations: chain.continuations, id: message.id } : { id: message.id });
  }

  while (pending.length) rows.push(markerRow(pending.shift()!));

  return rows;
};
