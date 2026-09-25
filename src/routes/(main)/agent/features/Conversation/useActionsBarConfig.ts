'use client';

import { useMemo } from 'react';

import { DEFAULT_MENU as ASSISTANT_DEFAULT_MENU } from '@/features/Conversation/Messages/Assistant/Actions';
import { DEFAULT_MENU as ASSISTANT_GROUP_DEFAULT_MENU } from '@/features/Conversation/Messages/AssistantGroup/Actions';
import { type ActionsBarConfig, type MessageActionSlot } from '@/features/Conversation/types';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

/**
 * Hetero-agent (Claude Code / Codex) sessions keep the menu minimal — copy +
 * delete — because the external runtime owns the assistant message lifecycle
 * (edit / regenerate / branching / translate / tts / share don't apply).
 * `select` remains available because forwarding / batch deletion is handled by
 * the local conversation UI and does not depend on the external runtime.
 *
 * The one user-message action that DOES belong here is `restoreToInput`: a long
 * CLI run that errors out or loses context is exactly when you want to pull the
 * original prompt (text + attachments) back into the composer to retry. So it
 * is scoped to the hetero user menu instead of the native-agent default.
 */
const HETERO_USER: { bar: MessageActionSlot[]; menu: MessageActionSlot[] } = {
  bar: ['copy'],
  menu: ['restoreToInput', 'copy', 'divider', 'select', 'divider', 'del'],
};

const HETERO_ASSISTANT: { bar: MessageActionSlot[]; menu: MessageActionSlot[] } = {
  bar: ['copy'],
  menu: ['copy', 'copyAsMarkdown', 'divider', 'select', 'divider', 'del'],
};

/**
 * Inserts `copyAsMarkdown` right after `copy` in a slot list — the reference's
 * `Copy as markdown` sits beside the plain copy action on assistant messages.
 */
const withCopyAsMarkdown = (slots: MessageActionSlot[]): MessageActionSlot[] =>
  slots.flatMap((slot) => (slot === 'copy' ? [slot, 'copyAsMarkdown'] : [slot]));

export const useActionsBarConfig = (): ActionsBarConfig => {
  const isHeteroAgent = useAgentStore(agentSelectors.isCurrentAgentHeterogeneous);

  return useMemo<ActionsBarConfig>(() => {
    if (isHeteroAgent) {
      return {
        assistant: HETERO_ASSISTANT,
        assistantGroup: HETERO_ASSISTANT,
        user: HETERO_USER,
      };
    }

    // Keep each role's default bar/menu but extend the assistant menus with
    // `copyAsMarkdown` — the audit's chat-options parity item on the agent
    // surface. Overriding `menu` only leaves the default bar untouched.
    return {
      assistant: { menu: withCopyAsMarkdown(ASSISTANT_DEFAULT_MENU) },
      assistantGroup: { menu: withCopyAsMarkdown(ASSISTANT_GROUP_DEFAULT_MENU) },
    };
  }, [isHeteroAgent]);
};
