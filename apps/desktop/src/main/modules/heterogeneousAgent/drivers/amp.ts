import type { HeterogeneousAgentDriver } from '../types';

// Amp executes through the upstream `amp-acp` bridge; it exposes no LobeHub
// provider/server-default binding, so the driver is intentionally empty.
export const ampDriver: HeterogeneousAgentDriver = {};
