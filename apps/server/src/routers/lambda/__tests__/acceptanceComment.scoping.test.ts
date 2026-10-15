// @vitest-environment node
import { randomUUID } from 'node:crypto';

import { type OrviloDatabase } from '@orvilo/database';
import {
  acceptances,
  verifyCheckResults,
  verifyEvidence,
  verifyRuns,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptanceCommentRouter } from '../acceptanceComment';
import { cleanupTestUser, createTestAgent, createTestUser } from './integration/setup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(() => testDB),
}));

const rect = { height: 0.2, width: 0.3, x: 0.1, y: 0.1 };

/**
 * A comment carries three references that the schema alone does not constrain:
 * the agent it speaks as, the round it was written against, and the evidence it
 * is pinned to. Access is resolved from `acceptanceId`, so each of those has to
 * be re-checked against that acceptance before it is stored — otherwise a
 * participant of one acceptance can name rows belonging to another.
 */
describe('acceptanceCommentRouter create reference scoping', () => {
  let serverDB: OrviloDatabase;
  let ownerId: string;
  let strangerId: string;
  let acceptanceId: string;
  let foreignAcceptanceId: string;
  let ownAgentId: string;
  let foreignAgentId: string;
  let ownRunId: string;
  let ownEvidenceId: string;
  let foreignRunId: string;
  let foreignEvidenceId: string;

  const seedRound = async (targetAcceptanceId: string, userId: string) => {
    const [run] = await serverDB
      .insert(verifyRuns)
      .values({ acceptanceId: targetAcceptanceId, roundIndex: 1, userId })
      .returning();
    const [result] = await serverDB
      .insert(verifyCheckResults)
      .values({ checkItemId: 'c1', userId, verifierType: 'agent', verifyRunId: run.id })
      .returning();
    const [evidence] = await serverDB
      .insert(verifyEvidence)
      .values({ checkResultId: result.id, type: 'screenshot', userId })
      .returning();
    return { evidenceId: evidence.id, runId: run.id };
  };

  beforeEach(async () => {
    serverDB = await getTestDB();
    testDB = serverDB;
    ownerId = await createTestUser(serverDB);
    strangerId = await createTestUser(serverDB);
    ownAgentId = await createTestAgent(serverDB, ownerId);
    foreignAgentId = await createTestAgent(serverDB, strangerId);

    const [own, foreign] = await serverDB
      .insert(acceptances)
      .values([
        { subjectId: randomUUID(), subjectType: 'standalone', userId: ownerId },
        { subjectId: randomUUID(), subjectType: 'standalone', userId: strangerId },
      ])
      .returning();
    acceptanceId = own.id;
    foreignAcceptanceId = foreign.id;

    ({ evidenceId: ownEvidenceId, runId: ownRunId } = await seedRound(acceptanceId, ownerId));
    ({ evidenceId: foreignEvidenceId, runId: foreignRunId } = await seedRound(
      foreignAcceptanceId,
      strangerId,
    ));
  });

  afterEach(async () => {
    await cleanupTestUser(serverDB, strangerId);
    await cleanupTestUser(serverDB, ownerId);
    vi.clearAllMocks();
  });

  const caller = (userId: string) =>
    acceptanceCommentRouter.createCaller({ jwtPayload: { userId }, userId } as any);

  it('rejects every stale comment write before accepting any agent, round or evidence reference', async () => {
    await expect(
      caller(ownerId).create({
        acceptanceId,
        authorAgentId: ownAgentId,
        clientId: randomUUID(),
        content: 'new comment',
        contextRunId: ownRunId,
        anchor: { checkItemId: 'c1', evidenceId: ownEvidenceId, rect },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(
      caller(ownerId).create({
        acceptanceId,
        authorAgentId: foreignAgentId,
        clientId: randomUUID(),
        content: 'foreign reference',
        contextRunId: foreignRunId,
        anchor: { checkItemId: 'c1', evidenceId: foreignEvidenceId, rect },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(serverDB.query.acceptanceComments.findMany()).resolves.toHaveLength(0);
    await expect(
      serverDB.query.verifyRuns.findFirst({ where: (table, { eq }) => eq(table.id, ownRunId) }),
    ).resolves.toMatchObject({ acceptanceId });
  });
});
