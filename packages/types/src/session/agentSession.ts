import type { AgentItem, OrviloAgentConfig } from '../agent';
import type { NewChatGroupAgent } from '../agentGroup';
import type { MetaData } from '../meta';

export const CHAT_GROUP_SESSION_ID_PREFIX = 'cg_' as const;

export const isChatGroupSessionId = (id?: string | null): id is string =>
  typeof id === 'string' && id.startsWith(CHAT_GROUP_SESSION_ID_PREFIX);

export enum OrviloSessionType {
  Agent = 'agent',
  Group = 'group',
}

/**
 * Extended group member that includes both relation data and agent details
 */
export type GroupMemberWithAgent = NewChatGroupAgent & AgentItem;

/**
 * Orvilo Agent Session
 */
export interface OrviloAgentSession {
  config: OrviloAgentConfig;
  createdAt: Date;
  group?: string;
  id: string;
  /** Market agent identifier for published agents */
  marketIdentifier?: string;
  meta: MetaData;
  model: string;
  pinned?: boolean;
  tags?: string[];
  type: OrviloSessionType.Agent;
  updatedAt: Date;
}

/**
 * Group chat (not confuse with session group)
 */
export interface OrviloGroupSession {
  createdAt: Date;
  group?: string;
  id: string; // Start with CHAT_GROUP_SESSION_ID_PREFIX
  members?: GroupMemberWithAgent[];
  meta: MetaData;
  pinned?: boolean;
  tags?: string[];
  type: OrviloSessionType.Group;
  updatedAt: Date;
}

export interface OrviloAgentSettings {
  /**
   * Language model agent configuration
   */
  config: OrviloAgentConfig;
  meta: MetaData;
}

// Union type for all session types
export type OrviloSession = OrviloAgentSession | OrviloGroupSession;

export type OrviloSessions = OrviloSession[];
