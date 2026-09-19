import type { HeterogeneousAgentDriver } from '../types';

// CodeBuddy executes through its native `codebuddy --acp` mode and exposes no
// Orvilo provider/server-default binding, so the driver is intentionally empty.
export const codeBuddyDriver: HeterogeneousAgentDriver = {};
