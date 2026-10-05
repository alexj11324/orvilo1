import type { DispatchAdmissionErrorCode } from '@orvilo/agent-execution/controlPlane';

/** Opaque cursors have no local order. Only a recorded gap is a failed replay. */
export const MAX_EVENT_CAUSATION_DEPTH = 32;

export interface CausationLink {
  id: string;
  sourceDispatchId: string | null;
  workspaceId: string | null;
}

export function decideReplayGap(input: {
  truncated: boolean;
}): DispatchAdmissionErrorCode | undefined {
  if (input.truncated) return 'invalid-event';
  return undefined;
}

/**
 * Walk from the claimed cause toward its root. A cycle, a foreign workspace,
 * or a chain that never reaches the declared root is not a dispatch.
 */
export function decideCausation(input: {
  causationId?: string;
  links: CausationLink[];
  rootDispatchId?: string;
  workspaceId: string;
}): DispatchAdmissionErrorCode | undefined {
  if (!input.causationId) return input.rootDispatchId ? 'invalid-event' : undefined;
  if (input.links.length === 0 || input.links[0]?.id !== input.causationId) return 'invalid-event';

  const seen = new Set<string>();
  for (const link of input.links) {
    if (seen.has(link.id)) return 'loop';
    seen.add(link.id);
    if (link.workspaceId !== input.workspaceId) return 'tenant-mismatch';
  }

  const last = input.links.at(-1);
  if (!last) return 'invalid-event';
  if (last.sourceDispatchId && seen.has(last.sourceDispatchId)) return 'loop';
  if (
    last.sourceDispatchId &&
    !seen.has(last.sourceDispatchId) &&
    input.links.length >= MAX_EVENT_CAUSATION_DEPTH
  ) {
    return 'loop';
  }
  if (
    last.sourceDispatchId &&
    !seen.has(last.sourceDispatchId) &&
    input.links.length < MAX_EVENT_CAUSATION_DEPTH
  ) {
    return 'invalid-event';
  }
  if (input.rootDispatchId && (last.id !== input.rootDispatchId || last.sourceDispatchId)) {
    return 'loop';
  }
  return undefined;
}
