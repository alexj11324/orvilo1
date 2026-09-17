from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1))

path = 'apps/server/src/services/taskDeliveryReview/index.ts'

replace_once(
    path,
    """    const repo = row.integration.repo;
    result.checked += 1;

    try {
""",
    """    const repo = row.integration.repo;
    result.checked += 1;

    // Review snapshots must describe an immutable candidate. If any task run
    // is still live, do not read/act on GitHub review state yet.
    if (rows.some((candidate) => candidate.status === 'running')) {
      result.waiting.push(task.identifier);
      continue;
    }

    try {
""",
)

replace_once(
    path,
    """      const snapshot = await getPullRequestReviewSnapshot(repo, prNumber, token, {
        baseBranch: record.baseBranch,
        headBranch: record.branch,
        ...(deliveryRecord.expectedHeadSha ? { headSha: deliveryRecord.expectedHeadSha } : {}),
        sameRepository: true,
      });
""",
    """      const snapshot = await getPullRequestReviewSnapshot(repo, prNumber, token, {
        baseBranch: record.baseBranch,
        headBranch: record.branch,
        sameRepository: true,
      });
""",
)

needle = """      if (!snapshot) {
        await taskModel.update(task.id, {
          error:
            'GitHub PR identity or revision could not be verified; review remains blocked and will retry.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      if (snapshot.baseBranch !== record.baseBranch) {
"""
replacement = """      if (!snapshot) {
        await taskModel.update(task.id, {
          error:
            'GitHub PR identity or revision could not be verified; review remains blocked and will retry.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      // Read the canonical PR even when its head moved, then reject the moved
      // revision explicitly. Returning generic "unavailable" would hide a
      // manually advanced or otherwise unaccepted delivery head.
      if (deliveryRecord.expectedHeadSha && snapshot.headSha !== deliveryRecord.expectedHeadSha) {
        await taskModel.update(task.id, {
          error: `Pull request head ${snapshot.headSha} does not match accepted delivery ${deliveryRecord.expectedHeadSha}.`,
        });
        result.waiting.push(task.identifier);
        continue;
      }

      if (snapshot.baseBranch !== record.baseBranch) {
"""
replace_once(path, needle, replacement)

print('PR #25 review-order follow-up applied')
