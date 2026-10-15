import { BUILTIN_AGENT_SLUGS } from './types';

const pausedAgentSlugs = new Set<string>([
  BUILTIN_AGENT_SLUGS.inbox,
  BUILTIN_AGENT_SLUGS.pageAgent,
  BUILTIN_AGENT_SLUGS.agentBuilder,
]);

/** Product availability of builtin Agents, independent of the configured harness. */
export const isBuiltinAgentAvailable = (slug?: string | null): boolean =>
  !slug || !pausedAgentSlugs.has(slug);
