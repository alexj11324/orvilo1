import { DEFAULT_SYSTEM_AGENT_CONFIG } from '@/const/settings';
import { type UserStore } from '@/store/user';
import { merge } from '@/utils/merge';

import { currentSettings } from './settings';

const currentSystemAgent = (s: UserStore) =>
  merge(DEFAULT_SYSTEM_AGENT_CONFIG, currentSettings(s).systemAgent);

const thread = (s: UserStore) => currentSystemAgent(s).thread;
export const systemAgentSelectors = {
  thread,
};
