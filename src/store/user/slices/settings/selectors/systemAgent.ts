import { DEFAULT_SYSTEM_AGENT_CONFIG } from '@/const/settings';
import { type UserStore } from '@/store/user';
import { merge } from '@/utils/merge';

import { currentSettings } from './settings';

const currentSystemAgent = (s: UserStore) =>
  merge(DEFAULT_SYSTEM_AGENT_CONFIG, currentSettings(s).systemAgent);

const topic = (s: UserStore) => currentSystemAgent(s).topic;
const thread = (s: UserStore) => currentSystemAgent(s).thread;
const promptRewrite = (s: UserStore) => currentSystemAgent(s).promptRewrite;
const historyCompress = (s: UserStore) => currentSystemAgent(s).historyCompress;

export const systemAgentSelectors = {
  historyCompress,
  promptRewrite,
  thread,
  topic,
};
