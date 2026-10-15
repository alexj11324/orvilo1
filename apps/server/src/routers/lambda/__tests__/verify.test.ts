import { beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyRouter } from '@/server/routers/lambda/verify';
import { FileService } from '@/server/services/file';
import type * as VerifyServiceModule from '@/server/services/verify';

const modelMocks = vi.hoisted(() => ({
  createEvidence: vi.fn(),
  purgeVerifyRun: vi.fn(),
  createRun: vi.fn(),
  deleteResult: vi.fn(),
  deleteRun: vi.fn(),
  findRunByOperation: vi.fn(),
  findRunById: vi.fn(),
  findResultById: vi.fn(),
  generateCriteria: vi.fn(),
  generateGoalCriteria: vi.fn(),
  generateGoalPlan: vi.fn(),
  getFullFileUrl: vi.fn(),
  getServerDB: vi.fn(async () => ({})),
  updateRun: vi.fn(),
  upsertByCheckItem: vi.fn(),
}));

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: modelMocks.getServerDB,
}));

vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn(function () {
    return {
      delete: modelMocks.deleteResult,
      findById: modelMocks.findResultById,
      upsertByCheckItem: modelMocks.upsertByCheckItem,
    };
  }),
}));

vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return {
      create: modelMocks.createRun,
      delete: modelMocks.deleteRun,
      findByOperation: modelMocks.findRunByOperation,
      findById: modelMocks.findRunById,
      update: modelMocks.updateRun,
    };
  }),
}));

vi.mock('@/database/models/verifyEvidence', () => ({
  VerifyEvidenceModel: vi.fn(function () {
    return {
      create: modelMocks.createEvidence,
    };
  }),
}));

vi.mock('@/server/services/verify', async (importOriginal) => ({
  ...(await importOriginal<typeof VerifyServiceModule>()),
  VerifyExecutorService: class VerifyExecutorService {},
  VerifyFeedbackService: class VerifyFeedbackService {},
  VerifyPlanGeneratorService: class VerifyPlanGeneratorService {
    generateCriteria = modelMocks.generateCriteria;
  },
  VerifyReporterService: class VerifyReporterService {},
}));

vi.mock('@/server/services/verify/acceptancePurge', () => ({
  purgeVerifyRun: modelMocks.purgeVerifyRun,
}));

vi.mock('@/server/services/goal/criteriaGenerator', () => ({
  GoalCriteriaGeneratorService: class GoalCriteriaGeneratorService {
    generate = modelMocks.generateGoalCriteria;
    generatePlan = modelMocks.generateGoalPlan;
  },
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return {
      getFullFileUrl: modelMocks.getFullFileUrl,
    };
  }),
}));

const createPublicCaller = () => verifyRouter.createCaller({} as any);

const selectRows = <T>(rows: T[]) => ({
  from: vi.fn(function () {
    return {
      where: vi.fn(function () {
        return {
          orderBy: vi.fn(async () => rows),
        };
      }),
    };
  }),
});

describe('verifyRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelMocks.getServerDB.mockResolvedValue({});
    vi.mocked(FileService).mockImplementation(function () {
      return {
        getFullFileUrl: modelMocks.getFullFileUrl,
      } as any;
    });
  });

  describe('getReportBundle', () => {
    // The real column is uuid-typed and the router guards malformed ids before
    // querying, so the fixture id must be a well-formed uuid.
    const RUN_UUID = '61a3475e-52b5-4a58-8ccc-e3ba43062c7a';

    it('reads a malformed run id as absent without ever querying', async () => {
      // Chat autolinkers glue trailing CJK punctuation onto shared links —
      // before the guard this aborted in Postgres (22P02) and surfaced as 500.
      const findFirst = vi.fn();
      modelMocks.getServerDB.mockResolvedValue({
        query: { verifyRuns: { findFirst } },
      });

      expect(
        await createPublicCaller().getReportBundle({ verifyRunId: `${RUN_UUID}（本轮` }),
      ).toBeNull();
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('hides a private run from visitors but not its owner', async () => {
      const run = {
        goal: 'Ship a working page',
        id: RUN_UUID,
        title: 'Run report',
        userId: 'owner-user',
        visibility: 'private',
        workspaceId: null,
      };
      const makeServerDB = () => ({
        query: {
          verifyReports: { findFirst: vi.fn(async () => null) },
          verifyRuns: { findFirst: vi.fn(async () => run) },
        },
        select: vi.fn().mockReturnValueOnce(selectRows([])),
      });

      // A visitor's denied read is indistinguishable from a missing run.
      modelMocks.getServerDB.mockResolvedValue(makeServerDB());
      expect(await createPublicCaller().getReportBundle({ verifyRunId: RUN_UUID })).toBeNull();

      // The owner still reads their own private report.
      modelMocks.getServerDB.mockResolvedValue(makeServerDB());
      const ownerCaller = verifyRouter.createCaller({ userId: 'owner-user' } as any);
      const bundle = await ownerCaller.getReportBundle({ verifyRunId: RUN_UUID });
      expect(bundle).toMatchObject({ isOwner: true, run: { id: RUN_UUID } });
    });

    it('reads a standalone report without a logged-in user', async () => {
      const run = {
        goal: 'Ship a working page',
        id: RUN_UUID,
        title: 'Run report',
        userId: 'owner-user',
        visibility: 'public',
        workspaceId: null,
      };
      const report = {
        id: 'report-1',
        totalChecks: 1,
        verdict: 'passed',
        verifyRunId: RUN_UUID,
      };
      const result = {
        checkItemId: 'check-1',
        checkItemIndex: 0,
        checkItemTitle: 'Page renders',
        id: 'result-1',
        required: true,
        status: 'passed',
        verdict: 'passed',
        verifyRunId: RUN_UUID,
      };
      const evidence = {
        checkResultId: 'result-1',
        content: null,
        description: 'Homepage screenshot',
        fileId: 'file-1',
        id: 'evidence-1',
        type: 'screenshot',
      };
      const serverDB = {
        query: {
          files: {
            findFirst: vi.fn(async () => ({
              id: 'file-1',
              name: 'evidence.png',
              url: 'verify/evidence.png',
            })),
          },
          verifyReports: {
            findFirst: vi.fn(async () => report),
          },
          verifyRuns: {
            findFirst: vi.fn(async () => run),
          },
        },
        select: vi
          .fn()
          .mockReturnValueOnce(selectRows([result]))
          .mockReturnValueOnce(selectRows([evidence])),
      };
      modelMocks.getServerDB.mockResolvedValue(serverDB);
      modelMocks.getFullFileUrl.mockResolvedValue('https://cdn.example.com/verify/evidence.png');

      const bundle = await createPublicCaller().getReportBundle({ verifyRunId: RUN_UUID });

      expect(bundle).toMatchObject({
        report,
        results: [
          {
            checkItemId: 'check-1',
            evidence: [
              {
                fileId: 'file-1',
                fileName: 'evidence.png',
                fileUrl: 'https://cdn.example.com/verify/evidence.png',
              },
            ],
          },
        ],
        run,
      });
      expect(modelMocks.findRunById).not.toHaveBeenCalled();
    });

    it('keeps returning the bundle when file URL resolution is unavailable', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(function () {});
      vi.mocked(FileService).mockImplementation(function () {
        throw new Error('S3 env missing');
      });

      const run = {
        goal: 'Ship a working page',
        id: RUN_UUID,
        title: 'Run report',
        userId: 'owner-user',
        visibility: 'public',
        workspaceId: null,
      };
      const result = {
        checkItemId: 'check-1',
        checkItemIndex: 0,
        checkItemTitle: 'Page renders',
        id: 'result-1',
        required: true,
        status: 'passed',
        verdict: 'passed',
        verifyRunId: RUN_UUID,
      };
      const evidence = {
        checkResultId: 'result-1',
        content: null,
        description: 'Homepage screenshot',
        fileId: 'file-1',
        id: 'evidence-1',
        type: 'screenshot',
      };
      const serverDB = {
        query: {
          files: {
            findFirst: vi.fn(async () => ({
              id: 'file-1',
              name: 'evidence.png',
              url: 'verify/evidence.png',
            })),
          },
          verifyReports: {
            findFirst: vi.fn(async () => null),
          },
          verifyRuns: {
            findFirst: vi.fn(async () => run),
          },
        },
        select: vi
          .fn()
          .mockReturnValueOnce(selectRows([result]))
          .mockReturnValueOnce(selectRows([evidence])),
      };
      modelMocks.getServerDB.mockResolvedValue(serverDB);

      const bundle = await createPublicCaller().getReportBundle({ verifyRunId: RUN_UUID });

      expect(bundle).toMatchObject({
        results: [
          {
            evidence: [
              {
                fileId: 'file-1',
                fileName: 'evidence.png',
                fileUrl: null,
              },
            ],
          },
        ],
        run,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[verify:getReportBundle:resolveFileMeta]',
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
