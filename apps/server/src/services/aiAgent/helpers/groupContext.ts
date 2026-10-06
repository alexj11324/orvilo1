import type { AgentGroupConfig } from '@orvilo/context-engine';
import type { OrviloDatabase } from '@orvilo/database';
import { formatGroupMembers, groupContextTemplate } from '@orvilo/prompts';
import { TRPCError } from '@trpc/server';

import { ChatGroupModel } from '@/database/models/chatGroup';

/**
 * Format error for storage in thread metadata
 * Handles Error objects which don't serialize properly with JSON.stringify
 */
export function formatErrorForMetadata(error: unknown): Record<string, any> | undefined {
  if (!error) return undefined;

  // Handle Error objects
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  // Handle objects with message property (like ChatMessageError)
  if (typeof error === 'object' && 'message' in error) {
    return error as Record<string, any>;
  }

  // Fallback: wrap in object
  return { message: String(error) };
}

/**
 * Build the multi-agent group context from a group's member roster, mirroring
 * the client `contextEngineering.ts` `agentGroup` build. Carries every member's
 * real `agt_*` ID so the supervisor dispatches members by ID instead of role
 * name (role names don't resolve → "Agent member(s) failed to start."). Resolves
 * the responding agent's own role/name so GroupContextInjector marks it with
 * `you="true"` and the orchestration filter activates for participants.
 */
export const buildGroupAgentContext = (
  currentAgentId: string,
  group: { content?: string | null; title?: string | null } | undefined,
  roster: Array<{ agentId: string; role: string | null; title: string | null }>,
): AgentGroupConfig | undefined => {
  if (roster.length === 0) return undefined;

  const agentMap: AgentGroupConfig['agentMap'] = {};
  const members: NonNullable<AgentGroupConfig['members']> = [];
  let currentAgentName: string | undefined;
  let currentAgentRole: 'supervisor' | 'participant' | undefined;

  for (const member of roster) {
    const role = member.role === 'supervisor' ? 'supervisor' : 'participant';
    const name = member.title?.trim() || 'Untitled Agent';
    agentMap[member.agentId] = { name, role };
    members.push({ id: member.agentId, name, role });

    if (member.agentId === currentAgentId) {
      currentAgentName = name;
      currentAgentRole = role;
    }
  }

  return {
    agentMap,
    currentAgentId,
    currentAgentName,
    currentAgentRole,
    groupTitle: group?.title || undefined,
    members,
    systemPrompt: group?.content || undefined,
  };
};

/**
 * Bot-conversation fallback: a single bot agent has no real group, so build a
 * degenerate one-member context purely to give it its `<group_context>`
 * identity block. Only used when there is no `groupId`.
 */
export const buildBotConversationGroupContext = (
  currentAgentId: string,
  agentConfig: { description?: unknown; title?: unknown } | undefined,
): AgentGroupConfig => {
  const title = agentConfig?.title;
  const description = agentConfig?.description;
  const name = typeof title === 'string' && title.trim() ? title.trim() : 'Current Agent';

  return {
    agentMap: { [currentAgentId]: { name, role: 'participant' } },
    currentAgentId,
    currentAgentName: name,
    currentAgentRole: 'participant',
    members: [{ id: currentAgentId, name, role: 'participant' }],
    systemPrompt: typeof description === 'string' ? description : undefined,
  };
};

/** Read group authority from its scoped, enabled roster before a run or tool call. */
export const resolveGroupRunContext = async (
  deps: { db: OrviloDatabase; userId: string; workspaceId?: string },
  input: { agentId: string; claimedRole?: 'member' | 'supervisor'; groupId: string },
) => {
  const model = new ChatGroupModel(deps.db, deps.userId, deps.workspaceId);
  const group = await model.findById(input.groupId);
  if (!group || group.isDeleted || group.deletedAt) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }
  const roster = await model.getGroupAgentsWithMeta(group.id);
  const member = roster.find((entry) => entry.agentId === input.agentId);
  const isGroupSupervisor = member?.role === 'supervisor';
  if (input.claimedRole === 'supervisor' && !isGroupSupervisor) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the group supervisor can orchestrate this group',
    });
  }
  if (!member) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Agent is not an enabled member of this group',
    });
  }
  return {
    group: {
      ...group,
      supervisorAgentId: roster.find((entry) => entry.role === 'supervisor')?.agentId,
    },
    groupContext: buildGroupAgentContext(input.agentId, group, roster),
    groupMembers: roster.map((entry) => ({
      id: entry.agentId,
      isSupervisor: entry.role === 'supervisor',
      title: entry.title,
    })),
    isGroupSupervisor,
  };
};

/** Keep the standard group identity and roster block on the ACP context channel. */
export const buildGroupAgentSystemContext = (
  context: AgentGroupConfig | undefined,
): string | undefined => {
  if (!context) return undefined;
  return `<group_context>\n${groupContextTemplate
    .replace('{{AGENT_NAME}}', context.currentAgentName || '')
    .replace('{{AGENT_ROLE}}', context.currentAgentRole || '')
    .replace('{{AGENT_ID}}', context.currentAgentId || '')
    .replace('{{GROUP_TITLE}}', context.groupTitle || '')
    .replace('{{SYSTEM_PROMPT}}', context.systemPrompt || '')
    .replace(
      '{{GROUP_MEMBERS}}',
      formatGroupMembers(context.members || [], context.currentAgentId),
    )}\n</group_context>`;
};
