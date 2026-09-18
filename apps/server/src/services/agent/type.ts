import { type OrviloAgentConfig } from '@/types/agent';

export interface UpdateAgentResult {
  agent?: OrviloAgentConfig;
  success: boolean;
}
