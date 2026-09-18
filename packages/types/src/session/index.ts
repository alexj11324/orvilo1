import type { OrviloSessions } from './agentSession';
import type { OrviloSessionGroups, SessionGroupId } from './sessionGroup';

export * from './agentSession';
export * from './sessionGroup';

export interface ChatSessionList {
  sessionGroups: OrviloSessionGroups;
  sessions: OrviloSessions;
}

export interface UpdateSessionParams {
  group?: SessionGroupId;
  meta?: any;
  pinned?: boolean;
  updatedAt: Date;
}
