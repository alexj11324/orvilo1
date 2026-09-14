import type { BuiltinIntervention } from '@orvilo/types';

import { MemoryApiName } from '../../types';
import AddExperienceMemoryIntervention from './AddExperienceMemory';

/**
 * Memory Intervention Components Registry
 *
 * Intervention components display when human approval is required before tool execution.
 */
export const MemoryInterventions: Record<string, BuiltinIntervention> = {
  [MemoryApiName.addExperienceMemory]: AddExperienceMemoryIntervention as BuiltinIntervention,
};
