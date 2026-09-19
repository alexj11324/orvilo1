import type { HeterogeneousAgentDriver } from '../types';

// OpenCode executes through its native `opencode acp` mode and exposes no
// Orvilo provider/server-default binding, so the driver is intentionally empty.
export const opencodeDriver: HeterogeneousAgentDriver = {};
