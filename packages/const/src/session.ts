import type { OrviloAgentSession, OrviloGroupSession } from '@orvilo/types';

import { DEFAULT_AGENT_META, DEFAULT_INBOX_AVATAR } from './meta';
import { DEFAULT_AGENT_CONFIG } from './settings';
import { merge } from './utils/merge';

export const INBOX_SESSION_ID = 'inbox';

export const WELCOME_GUIDE_CHAT_ID = 'welcome';

const DEFAULT_AGENT_SESSION_TYPE = 'agent' as OrviloAgentSession['type'];
const DEFAULT_GROUP_SESSION_TYPE = 'group' as OrviloGroupSession['type'];

export const DEFAULT_AGENT_ORVILO_SESSION: OrviloAgentSession = {
  config: DEFAULT_AGENT_CONFIG,
  createdAt: new Date(),
  id: '',
  meta: DEFAULT_AGENT_META,
  model: DEFAULT_AGENT_CONFIG.model,
  type: DEFAULT_AGENT_SESSION_TYPE,
  updatedAt: new Date(),
};

export const DEFAULT_GROUP_ORVILO_SESSION: OrviloGroupSession = {
  createdAt: new Date(),
  id: '',
  members: [],
  meta: DEFAULT_AGENT_META,
  type: DEFAULT_GROUP_SESSION_TYPE,
  updatedAt: new Date(),
};

export const DEFAULT_INBOX_SESSION: OrviloAgentSession = merge(DEFAULT_AGENT_ORVILO_SESSION, {
  id: 'inbox',
  meta: {
    avatar: DEFAULT_INBOX_AVATAR,
  },
});
