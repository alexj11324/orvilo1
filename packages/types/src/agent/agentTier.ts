/**
 * Model-intelligence tiers for tiered orchestration (FrugalGPT-style
 * cheap-first routing): a `project_agents` row declares the capability band
 * its agent runs at, the intake matcher picks the lowest band that satisfies
 * the task's required tier, and a terminally failed orchestrated dispatch
 * escalates the next attempt one band up.
 *
 * `low < mid < high` is a total order, not a capability matrix — a higher band
 * always satisfies a lower requirement.
 */
export const AGENT_TIERS = ['low', 'mid', 'high'] as const;

export type AgentTier = (typeof AGENT_TIERS)[number];

export const AGENT_TIER_RANK: Record<AgentTier, number> = {
  low: 0,
  mid: 1,
  high: 2,
};

export const agentTierRank = (tier: AgentTier): number => AGENT_TIER_RANK[tier];

/** The band above `tier`, or `undefined` when already at the top. */
export const nextAgentTier = (tier: AgentTier): AgentTier | undefined =>
  AGENT_TIERS[AGENT_TIER_RANK[tier] + 1];

/**
 * The tier a Task requires, resolved from its Linear-style priority integer
 * (0 = none, 1 = urgent, 2 = high, 3 = normal, 4 = low). Urgent/high work
 * starts on the strong band, normal work on the middle band, and low or
 * unprioritized work on the cheap band.
 */
export const requiredAgentTierForPriority = (priority: number | null | undefined): AgentTier => {
  if (priority === 1 || priority === 2) return 'high';
  if (priority === 3) return 'mid';
  return 'low';
};
