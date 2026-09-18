/**
 * Provenance env for a heterogeneous agent's child process.
 *
 * An external CLI agent (Claude Code / Codex) runs blind to the Orvilo session
 * it was launched from: it has no way to name the topic it lives in, so anything
 * it publishes — a verification report, an artifact, a trace — lands detached
 * from the conversation that asked for it. Echoing the ids into the child env
 * closes that loop for free: the CLI inherits them, so does every subprocess it
 * spawns (`lh`, a script, a test harness), and each one can attribute its output
 * back to this topic without the agent having to pass ids it cannot see.
 *
 * Read by the CLI commands that attribute their output back to this topic —
 * `lh notify`, `lh doc`, `lh goal` and `lh verify plan state` all resolve the
 * conversation from these instead of asking the agent for ids it cannot see.
 */
export interface OrviloSessionEnvIds {
  agentId?: string | null;
  operationId?: string | null;
  topicId?: string | null;
}

/** Only the ids that actually resolved — never an env var set to "undefined". */
export const buildOrviloSessionEnv = ({
  agentId,
  operationId,
  topicId,
}: OrviloSessionEnvIds): Record<string, string> => {
  const env: Record<string, string> = {};

  if (agentId) env.ORVILO_AGENT_ID = agentId;
  if (operationId) env.ORVILO_OPERATION_ID = operationId;
  if (topicId) env.ORVILO_TOPIC_ID = topicId;

  return env;
};
