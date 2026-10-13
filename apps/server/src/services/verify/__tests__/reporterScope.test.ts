import { describe, expect, it, vi } from 'vitest';

import { AiGenerationService } from '@/server/services/aiGeneration';

import { VerifyReporterService } from '../reporter';

const { generateObject, upsertByRun } = vi.hoisted(() => ({
  generateObject: vi
    .fn()
    .mockResolvedValue({ content: 'Checked on workspace host', summary: 'Passed' }),
  upsertByRun: vi.fn(async (input) => input),
}));

vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: vi.fn(function () {
    return { generateObject };
  }),
}));
vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn(function () {
    return {
      listByRun: vi
        .fn()
        .mockResolvedValue([
          {
            checkItemId: 'c1',
            checkItemTitle: 'Content',
            required: true,
            status: 'passed',
            verdict: 'passed',
          },
        ]),
    };
  }),
}));
vi.mock('@/database/models/verifyEvidence', () => ({
  VerifyEvidenceModel: vi.fn(function () {
    return { listByRun: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('@/database/models/document', () => ({
  DocumentModel: vi.fn(function () {
    return { findByIds: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('@/database/models/verifyReport', () => ({
  VerifyReportModel: vi.fn(function () {
    return { upsertByRun };
  }),
}));

describe('workspace verification report', () => {
  it('uses the workspace verifier runtime when generating the narrative', async () => {
    const db = {} as any;
    const report = await new VerifyReporterService(db, 'user-1', 'ws-1').generateReport({
      deliverable: 'original delivery',
      modelConfig: { model: 'native-model', provider: 'opencode' },
      orchestrationWorkflow: 'Check workspace delivery',
      verifyRunId: 'run-1',
    });
    expect(AiGenerationService).toHaveBeenCalledWith(db, 'user-1', 'ws-1');
    expect(report).toMatchObject({ verdict: 'passed', summary: 'Passed', passedChecks: 1 });
  });
});
