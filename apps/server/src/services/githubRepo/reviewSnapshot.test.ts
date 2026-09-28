// @vitest-environment node
import { describe, it } from 'vitest';

import { reviewSnapshotCases } from './__tests__/reviewSnapshot.cases';
import { readPullRequestReviewSnapshot } from './reviewSnapshot';

describe('complete, revision-fenced GitHub snapshots', () => {
  for (const scenario of reviewSnapshotCases) {
    it(scenario.name, () => scenario.run(readPullRequestReviewSnapshot));
  }
});
