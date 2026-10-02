/**
 * Deterministic default name for a freshly created agent: the agent's own
 * product/type name ("Claude Code", "Codex", "Orvilo AI"), numbered on
 * collision — "Claude Code", "Claude Code 2", "Claude Code 3", ...
 *
 * The first agent keeps the bare base name; suffixes only appear when the
 * sidebar already holds the same name. Comparison is case-insensitive so a
 * hand-renamed "claude code" still reserves the slot.
 */
export const numberedAgentName = (base: string, taken?: Iterable<string>): string => {
  const trimmed = base.trim();
  if (!trimmed) return trimmed;

  const used = new Set([...(taken ?? [])].map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (!used.has(trimmed.toLowerCase())) return trimmed;

  for (let suffix = 2; ; suffix++) {
    const candidate = `${trimmed} ${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
};
