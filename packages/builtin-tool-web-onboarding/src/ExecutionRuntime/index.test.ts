import { describe, expect, it, vi } from 'vitest';

import { WebOnboardingExecutionRuntime } from '.';

const createRuntime = () => {
  const finishOnboarding = vi.fn().mockResolvedValue({ content: 'Finished', success: true });
  const runtime = new WebOnboardingExecutionRuntime({
    finishOnboarding,
    readDocument: vi.fn(),
    saveUserQuestion: vi.fn(),
    updateDocument: vi.fn(),
  });
  return { finishOnboarding, runtime };
};

describe('WebOnboardingExecutionRuntime completion', () => {
  it('finishes through the existing service without a catalog runtime', async () => {
    const { finishOnboarding, runtime } = createRuntime();
    expect(await runtime.finishOnboarding()).toMatchObject({ content: 'Finished', success: true });
    expect(finishOnboarding).toHaveBeenCalledOnce();
    expect(runtime).not.toHaveProperty('showAgentMarketplace');
    expect(runtime).not.toHaveProperty('submitAgentPick');
  });
});
