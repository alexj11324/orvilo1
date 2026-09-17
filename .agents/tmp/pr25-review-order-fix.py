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
    """  createPullRequestForBranch,
  getPullRequestReviewSnapshot,
""",
    """  createPullRequestForBranch,
  findBranchPr,
  getPullRequestReviewSnapshot,
""",
)
old = """    const record = row.integration;
    const repo = row.integration.repo;
    result.checked += 1;

    if (!(await ensureReviewTaskPaused(db, task, rows, workspaceId))) {
      result.waiting.push(task.identifier);
      continue;
    }

    try {
      const credKey = await getCredentialKey(db, task, workspaceId);
      const token = await resolveGithubAccessToken({
        credKey,
        db,
        userId: task.createdByUserId,
        workspaceId,
      });

      let prNumber = record.prNumber;
      let prUrl = record.prUrl;
      if (!prNumber) {
        const remoteHead = await getRemoteBranchSha(repo, record.branch, token);
        if (remoteHead) {
          const created = await createPullRequestForBranch({
            baseBranch: record.baseBranch,
            body: `Automated delivery for Orvilo task ${task.identifier}. This PR remains open while CI and review feedback are processed.`,
            headBranch: record.branch,
            repo,
            title: `${task.identifier}: ${task.name || task.instruction.slice(0, 80)}`,
            token,
          });
          prNumber = created?.number;
          prUrl = created?.url;
          if (prNumber && prUrl) {
            await topicModel.updateIntegration(task.id, row.topicId, {
              expectedHeadSha: remoteHead,
              prNumber,
              prUrl,
            });
          }
        }
      }

      if (!prNumber) {
        await taskModel.update(task.id, {
          error:
            'Pull request required: push the delivery branch to GitHub before review can continue.',
        });
        result.paused.push(task.identifier);
        continue;
      }

      const snapshot = await getPullRequestReviewSnapshot(repo, prNumber, token, {
        baseBranch: record.baseBranch,
        headBranch: record.branch,
        sameRepository: true,
      });
"""
new = """    const record = row.integration;
    const repo = row.integration.repo;
    result.checked += 1;

    try {
      const credKey = await getCredentialKey(db, task, workspaceId);
      const token = await resolveGithubAccessToken({
        credKey,
        db,
        userId: task.createdByUserId,
        workspaceId,
      });

      // A task is not in delivery review until the remote branch and canonical
      // PR identity are durable. This also recovers the cross-system half-fail
      // where GitHub created the PR but the database write was interrupted.
      let deliveryRecord = record;
      let prNumber = record.prNumber;
      let prUrl = record.prUrl;
      if (!prNumber) {
        const remoteHead = await getRemoteBranchSha(repo, record.branch, token);
        if (!remoteHead) {
          await taskModel.update(task.id, {
            error: 'Delivery branch is not published to GitHub yet; review has not started.',
          });
          result.waiting.push(task.identifier);
          continue;
        }
        const existing = await findBranchPr(repo, record.branch, record.baseBranch, token);
        const bound =
          existing ??
          (await createPullRequestForBranch({
            baseBranch: record.baseBranch,
            body: `Automated delivery for Orvilo task ${task.identifier}. This PR remains open while CI and review feedback are processed.`,
            headBranch: record.branch,
            repo,
            title: `${task.identifier}: ${task.name || task.instruction.slice(0, 80)}`,
            token,
          }));
        prNumber = bound?.number;
        prUrl = bound?.url;
        if (prNumber && prUrl) {
          const persisted = await topicModel.updateIntegration(task.id, row.topicId, {
            expectedHeadSha: remoteHead,
            prNumber,
            prUrl,
          });
          if (!persisted) throw new Error('Pull request identity could not be persisted');
          deliveryRecord = { ...record, expectedHeadSha: remoteHead, prNumber, prUrl };
        }
      }

      if (!prNumber) {
        await taskModel.update(task.id, {
          error: 'Pull request could not be established; review has not started.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      const snapshot = await getPullRequestReviewSnapshot(repo, prNumber, token, {
        baseBranch: record.baseBranch,
        headBranch: record.branch,
        ...(deliveryRecord.expectedHeadSha ? { headSha: deliveryRecord.expectedHeadSha } : {}),
        sameRepository: true,
      });
"""
replace_once(path, old, new)
replace_once(
    path,
    """      if (snapshot.baseBranch !== record.baseBranch) {
        await topicModel.updateIntegration(task.id, row.topicId, {
""",
    """      if (snapshot.baseBranch !== record.baseBranch) {
        await topicModel.updateIntegration(task.id, row.topicId, {
""",
)
# Insert identity persistence + review transition after base validation block.
needle = """        result.paused.push(task.identifier);
        continue;
      }

      if (snapshot.merged) {
"""
replacement = """        result.paused.push(task.identifier);
        continue;
      }

      if (!deliveryRecord.expectedHeadSha) {
        const persisted = await topicModel.updateIntegration(task.id, row.topicId, {
          expectedBaseSha: snapshot.baseSha,
          expectedHeadSha: snapshot.headSha,
          prNumber: snapshot.number,
          prUrl: snapshot.url,
        });
        if (!persisted) throw new Error('Pull request identity could not be persisted');
        deliveryRecord = {
          ...deliveryRecord,
          expectedBaseSha: snapshot.baseSha,
          expectedHeadSha: snapshot.headSha,
          prNumber: snapshot.number,
          prUrl: snapshot.url,
        };
      }

      // Only now does the task cross the user-visible Pending Review boundary.
      // If a run is still live, keep waiting rather than reviewing mutable code.
      if (!(await ensureReviewTaskPaused(db, task, rows, workspaceId))) {
        result.waiting.push(task.identifier);
        continue;
      }

      if (snapshot.merged) {
"""
replace_once(path, needle, replacement)
replace_once(path, "record: { ...record, prNumber },", "record: { ...deliveryRecord, prNumber },")
replace_once(path, "await dispatchCorrective({ db, record, row, snapshot, task, workspaceId });", "await dispatchCorrective({ db, record: deliveryRecord, row, snapshot, task, workspaceId });")
replace_once(
    path,
    "record: { ...record, expectedHeadSha: snapshot.headSha, prNumber: snapshot.number },",
    "record: { ...deliveryRecord, expectedHeadSha: snapshot.headSha, prNumber: snapshot.number },",
)

# Extend controller fixtures with explicit publication/review ordering coverage.
test = 'apps/server/src/services/taskDeliveryReview/__tests__/reviewController.cases.ts'
replace_once(test, "    liveTopic?: boolean;\n", "    liveTopic?: boolean;\n    missingPr?: boolean;\n    missingRemote?: boolean;\n    runningTask?: boolean;\n")
replace_once(test, "      prNumber: 9,\n", "      ...(options.missingPr ? {} : { prNumber: 9 }),\n")
replace_once(test, "    status: 'paused',\n", "    status: options.runningTask ? 'running' : 'paused',\n")
replace_once(
    test,
    """    merges: [] as { expectedHeadSha: string }[],
    rows,
    runs: [] as Record<string, unknown>[],
""",
    """    events: [] as string[],
    merges: [] as { expectedHeadSha: string }[],
    rows,
    runs: [] as Record<string, unknown>[],
""",
)
replace_once(
    test,
    """        async updateIntegration(_task: string, topic: string, patch: Partial<Row['integration']>) {
          if (options.failPersistence) return false;
""",
    """        async updateIntegration(_task: string, topic: string, patch: Partial<Row['integration']>) {
          state.events.push('persist-pr');
          if (options.failPersistence) return false;
""",
)
replace_once(
    test,
    """        async updateStatus(args: { status: string }) {
          if (args.status === 'completed') state.completed.push(args.status);
        }
""",
    """        async updateStatus(args: { status: string }) {
          if (args.status === 'paused') state.events.push('enter-review');
          if (args.status === 'completed') state.completed.push(args.status);
        }
""",
)
replace_once(
    test,
    """      createPullRequestForBranch: async () => {
        throw new Error('Unexpected new PR');
      },
      getRemoteBranchSha: async () => HEAD,
""",
    """      createPullRequestForBranch: async () => {
        state.events.push('create-pr');
        return { number: 9, url: 'https://github.com/acme/widgets/pull/9' };
      },
      findBranchPr: async () => undefined,
      getRemoteBranchSha: async () => (options.missingRemote ? undefined : HEAD),
""",
)
# Row typing now permits the pre-binding state.
replace_once(test, "    prNumber: number;\n", "    prNumber?: number;\n")
# Add scenarios before external merge case.
marker = """add('an external merge of a different accepted head is not completed', async (load) => {
"""
addition = """add('missing remote delivery does not enter review without a PR', async (load) => {
  const f = setup({ missingPr: true, missingRemote: true, runningTask: true });
  const result = await (await load(f.mocks))(f.db);
  assert.deepEqual(result.waiting, ['T-1']);
  assert.equal(f.state.events.includes('enter-review'), false);
  assert.equal(f.state.events.includes('create-pr'), false);
});

add('persists the canonical PR before entering review', async (load) => {
  const f = setup({ missingPr: true, runningTask: true, first: { draft: true } });
  await (await load(f.mocks))(f.db);
  const persisted = f.state.events.indexOf('persist-pr');
  const entered = f.state.events.indexOf('enter-review');
  assert.ok(persisted >= 0);
  assert.ok(entered > persisted);
  assert.equal(f.state.events.filter((event) => event === 'create-pr').length, 1);
});

"""
replace_once(test, marker, addition + marker)

# The lightweight drizzle mock must include any newly imported symbol changes only if needed.
print('PR #25 review-order fixes applied')
