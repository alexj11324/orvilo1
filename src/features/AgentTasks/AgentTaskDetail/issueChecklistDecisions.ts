interface ChecklistResult {
  id: string;
  userDecision?: string | null;
  verdict?: string | null;
  verifyRunId?: string | null;
}

/** Batch acceptance only affects reviewed, undecided items in this delivery round. */
export const pendingChecklistResultIds = (results: ChecklistResult[], runId?: string) =>
  runId
    ? results
        .filter(
          (result) =>
            result.verifyRunId === runId && result.verdict && result.userDecision !== 'accepted',
        )
        .map((result) => result.id)
    : [];
