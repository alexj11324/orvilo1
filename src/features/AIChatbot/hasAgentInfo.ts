interface AgentInfoSource {
  description?: string;
  systemRole?: string;
}

/**
 * Whether the Agent has anything to show beyond its name. The Agent picker
 * beside the settings button already names it, so a name alone is a duplicate row.
 */
export const hasAgentInfo = ({ description, systemRole }: AgentInfoSource): boolean =>
  Boolean(description || systemRole);
