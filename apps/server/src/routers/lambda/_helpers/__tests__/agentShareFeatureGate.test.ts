// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  businessConst: { ENABLE_BUSINESS_FEATURES: true },
}));

vi.mock('@orvilo/business-const', () => mocks.businessConst);

const {
  assertAgentShareCreationEnabled,
  assertAgentShareVisitorEnabled,
  assertAgentShareVisitorExecutionEnabled,
} = await import('../agentShareFeatureGate');

/**
 * Publishing and running shared agents are retired. These gates sit on the two
 * capabilities that are gone, so the assertions are deliberately about refusal
 * being unconditional: the previous cases here covered a rollout flag granting
 * access, and a flag-driven path is exactly what the retirement must not leave
 * behind for an old client or a still-valid visitor token to reach.
 */
describe('retired capabilities', () => {
  it('refuses publishing regardless of deployment or account', async () => {
    mocks.businessConst.ENABLE_BUSINESS_FEATURES = true;

    expect(() => assertAgentShareCreationEnabled()).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('refuses publishing even where the deployment supports sharing', async () => {
    mocks.businessConst.ENABLE_BUSINESS_FEATURES = false;

    expect(() => assertAgentShareCreationEnabled()).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('refuses starting a visitor run', () => {
    expect(() => assertAgentShareVisitorExecutionEnabled()).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

/**
 * Visitor access to an EXISTING share is not retired: owners still review and
 * revoke, an old link still resolves so it can explain itself, and an in-flight
 * run can still be interrupted. That is why this gate keeps its original
 * deployment-only behaviour rather than refusing outright.
 */
describe('assertAgentShareVisitorEnabled', () => {
  it('rejects on deployments without business features', () => {
    mocks.businessConst.ENABLE_BUSINESS_FEATURES = false;

    expect(() => assertAgentShareVisitorEnabled()).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
      }),
    );
  });

  it('admits reads on a deployment that supports sharing', () => {
    mocks.businessConst.ENABLE_BUSINESS_FEATURES = true;

    expect(() => assertAgentShareVisitorEnabled()).not.toThrow();
  });
});
