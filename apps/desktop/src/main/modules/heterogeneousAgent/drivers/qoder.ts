import type { HeterogeneousAgentDriver } from '../types';

// Qoder executes through its native `qoder --acp` mode and exposes no LobeHub
// provider/server-default binding, so the driver is intentionally empty.
export const qoderDriver: HeterogeneousAgentDriver = {};
