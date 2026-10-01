import type { ControlResult, IsolationEvidence, QuiescenceProof } from './contracts';

export interface IsolatedLaunch {
  args: string[];
  environment: Record<string, string>;
  executable: string;
  workspace: string;
}

/** Implementations must constrain the entire descendant tree (including Python,
 * extensions and MCP), exclude control DB/vault mounts, and deny bypass network.
 * An executable's presence or a detached process group is not isolation evidence. */
export interface ProcessTreeSupervisor {
  launch: (input: IsolatedLaunch) => Promise<ControlResult<IsolationEvidence>>;
  terminate: (treeId: string) => Promise<ControlResult<QuiescenceProof>>;
}

/** Explicit allowlist, never spread process.env. PATH and loader variables are not
 * inherited; executable and helper paths must be resolved by the trusted supervisor. */
export function sanitizedRuntimeEnvironment(input: {
  home: string;
  temp: string;
}): Record<string, string> {
  return { HOME: input.home, TMPDIR: input.temp, LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' };
}

/** Portable default: no approved, measured OS supervisor means no runtime launch. */
export const unavailableProcessTreeSupervisor: ProcessTreeSupervisor = {
  async launch() {
    return {
      ok: false,
      error: {
        code: 'isolation_unavailable',
        message: 'No approved OS process-tree supervisor configured',
        retryable: false,
      },
    };
  },
  async terminate() {
    return {
      ok: false,
      error: {
        code: 'not_quiescent',
        message: 'No supervisor can prove tree quiescence',
        retryable: false,
      },
    };
  },
};

/** Shape validation only: callers must obtain this report from the trusted supervisor,
 * never from the runtime being isolated. It does not establish OS enforcement itself. */
export function verifiedIsolation(evidence: unknown): evidence is IsolationEvidence {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return false;
  const report = evidence as Record<string, unknown>;
  return (
    typeof report.supervisorId === 'string' &&
    report.supervisorId.trim().length > 0 &&
    typeof report.treeId === 'string' &&
    report.treeId.trim().length > 0 &&
    report.enforced === true &&
    report.filesystem === true &&
    report.network === true &&
    report.processes === true &&
    report.sanitizedEnvironment === true &&
    report.credentialsExcluded === true
  );
}
