// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const triggerMock = vi.fn();
vi.mock('@/libs/observability/traceparent', () => ({
  injectActiveTraceHeaders: (headers: Headers) => headers.set('traceparent', 'trace-1'),
}));
vi.mock('@/server/services/hatchet/workflows', () => ({ triggerHatchetWorkflow: triggerMock }));

const { OnboardingUnderstandingWorkflow, UnderstandingWorkflowUnavailableError } =
  await import('.');

describe('OnboardingUnderstandingWorkflow', () => {
  const originalToken = process.env.HATCHET_CLIENT_TOKEN;

  beforeEach(() => {
    process.env.HATCHET_CLIENT_TOKEN = 'hatchet-test';
    triggerMock.mockReset();
    triggerMock.mockResolvedValue({ workflowRunId: 'workflow-result' });
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.HATCHET_CLIENT_TOKEN;
    else process.env.HATCHET_CLIENT_TOKEN = originalToken;
  });

  it('triggers provider processing without serializing parallel provider branches', async () => {
    const payload = {
      providers: [{ id: 'github', revision: 1 }],
      responseLanguage: 'zh-CN',
      sessionId: 'session:1',
      topicId: 'topic-1',
      userId: 'user-1',
    };

    await OnboardingUnderstandingWorkflow.triggerProviders(payload);

    expect(triggerMock).toHaveBeenCalledWith(
      '/api/workflows/onboarding/understanding/process-providers',
      payload,
      {
        concurrencyKey: 'onboarding-understanding.providers.session:1',
        headers: { traceparent: 'trace-1' },
        workflowRunId: undefined,
      },
    );
  });

  it('allows an explicit deterministic workflow run id for initial and retry triggers', async () => {
    await OnboardingUnderstandingWorkflow.triggerProviders(
      {
        providers: [
          { id: 'gmail', revision: 1 },
          { id: 'github', revision: 1 },
        ],
        responseLanguage: 'zh-CN',
        sessionId: 'session-1',
        topicId: 'topic-1',
        userId: 'user-1',
      },
      { workflowRunId: 'initial-session-1' },
    );

    expect(triggerMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ workflowRunId: 'initial-session-1' }),
    );
  });

  /**
   * @example
   * expect(trigger.url).toContain('process-collected');
   */
  it('triggers a direct rewrite for feedback-only revisions', async () => {
    const payload = {
      responseLanguage: 'zh-CN',
      sessionId: 'session-1',
      sourceFingerprint: 'github@1',
      topicId: 'topic-1',
      userId: 'user-1',
    };

    await OnboardingUnderstandingWorkflow.triggerWriting(payload, {
      workflowRunId: 'feedback-session-1-revision-2',
    });

    expect(triggerMock).toHaveBeenCalledWith(
      '/api/workflows/onboarding/understanding/process-collected',
      payload,
      expect.objectContaining({
        headers: { traceparent: 'trace-1' },
        workflowRunId: 'feedback-session-1-revision-2',
      }),
    );
  });

  it('rejects triggering when workflow configuration is unavailable', async () => {
    delete process.env.HATCHET_CLIENT_TOKEN;
    expect(() => OnboardingUnderstandingWorkflow.assertAvailable()).toThrow(
      UnderstandingWorkflowUnavailableError,
    );
    await expect(
      OnboardingUnderstandingWorkflow.triggerProviders({
        providers: [{ id: 'github', revision: 1 }],
        responseLanguage: 'zh-CN',
        sessionId: 'session-1',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(UnderstandingWorkflowUnavailableError);
    expect(triggerMock).not.toHaveBeenCalled();
  });
});
