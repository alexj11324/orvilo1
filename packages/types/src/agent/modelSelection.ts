/** Model configuration used by an Agent. */
export interface AgentModelConfig {
  model: string;
  provider?: string;
}

/** Saved Agent defaults with an optional internal sub-agent override. */
export const resolveAgentModelConfig = (
  shared: AgentModelConfig,
  explicitOverride?: Partial<AgentModelConfig> | null,
): AgentModelConfig => ({
  model: explicitOverride?.model ?? shared.model,
  provider: explicitOverride?.provider ?? shared.provider,
});
