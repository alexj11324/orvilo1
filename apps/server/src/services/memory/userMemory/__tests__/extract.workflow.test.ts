// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryExtractionWorkflowService } from '../extract';

interface HourlyMetadataInput {
  cursor?: {
    createdAt: string;
    id: string;
  };
  startedAt: string;
}

const { mockAsyncTaskModel, mockCreate, mockGetServerDB, mockTrigger } = vi.hoisted(() => ({
  mockAsyncTaskModel: vi.fn(),
  mockCreate: vi.fn(),
  mockGetServerDB: vi.fn(),
  mockTrigger: vi.fn(),
}));

vi.mock('@/database/server', () => ({
  getServerDB: mockGetServerDB,
}));

vi.mock('@/database/models/asyncTask', () => ({
  AsyncTaskModel: mockAsyncTaskModel,
  initHourlyUserMemoryExtractionMetadata: vi.fn(function (metadata: HourlyMetadataInput) {
    return {
      control: (metadata as HourlyMetadataInput & { control?: unknown }).control,
      cursor: metadata.cursor,
      progress: {
        processedUsers: 0,
        scheduledBatches: 0,
        scheduledChildRuns: 0,
      },
      source: 'hourly_chat_topic',
      startedAt: metadata.startedAt,
    };
  }),
}));

vi.mock('@/server/services/hatchet/workflows', () => ({
  triggerHatchetWorkflow: mockTrigger,
}));

describe('retired platform memory scheduling', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      'hourly',
      () => MemoryExtractionWorkflowService.triggerHourly({ baseUrl: 'https://app.example.com' }),
    ],
    [
      'tracked hourly',
      () =>
        MemoryExtractionWorkflowService.triggerHourlyTracked({
          baseUrl: 'https://app.example.com',
        }),
    ],
    [
      'explicit users',
      () =>
        MemoryExtractionWorkflowService.triggerProcessUsers({
          baseUrl: 'https://app.example.com',
          userIds: ['user-1'],
        }),
    ],
  ])('rejects %s before creating tasks or triggering workflows', async (_name, schedule) => {
    await expect(schedule()).rejects.toThrow('Platform automatic memory extraction is unavailable');
    expect(mockGetServerDB).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
