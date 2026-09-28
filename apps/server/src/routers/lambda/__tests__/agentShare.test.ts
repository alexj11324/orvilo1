// @vitest-environment node
import type * as BusinessConst from '@orvilo/business-const';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createContextInner } from '@/libs/trpc/lambda/context';

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

// `assertAgentShareCreationEnabled` (`_helpers/agentShareFeatureGate.ts`) runs
// for real in this suite, so the router tests exercise the actual gate.
//
// It has no inputs to mock: §6.5 retired the publish chain by *removing* the
// `enableAgentShare` branch rather than inverting it, so the refusal reads no
// deployment flag and no per-user capability. The flag mock below therefore
// exists to be asserted *unconsulted* — a regression that reintroduces a flag
// gate would show up as a call on it.
const mocks = vi.hoisted(() => ({
  businessConst: { ENABLE_BUSINESS_FEATURES: true },
}));
vi.mock('@orvilo/business-const', async () => {
  const actual = await vi.importActual<typeof BusinessConst>('@orvilo/business-const');
  return {
    ...actual,
    // `packages/utils/src/apiKey.ts` reads this dynamically (`import * as
    // businessConst`), pulled in transitively via the unmocked
    // `createContextInner` -> `ApiKeyModel` chain below. `actual` here
    // resolves to the cloud override, which omits this key entirely (see
    // that file's own doc comment), so vitest's mock-export validation has
    // no own property to find unless it is listed explicitly.
    API_KEY_PREFIX: (actual as Record<string, unknown>).API_KEY_PREFIX,
    // A getter (not a static spread) so per-test mutation of
    // `mocks.businessConst.ENABLE_BUSINESS_FEATURES` is observed by every
    // subsequent read, including inside the already-imported gate helper.
    get ENABLE_BUSINESS_FEATURES() {
      return mocks.businessConst.ENABLE_BUSINESS_FEATURES;
    },
  };
});

const mockCreate = vi.fn();
const mockGetByAgentId = vi.fn();
const mockUpdateConfig = vi.fn();
const mockUpdateSlug = vi.fn();
const mockUpdateVisibility = vi.fn();

vi.mock('@/database/models/agentShare', () => ({
  AgentShareModel: vi.fn(function () {
    return {
      create: mockCreate,
      getByAgentId: mockGetByAgentId,
      updateConfig: mockUpdateConfig,
      updateSlug: mockUpdateSlug,
      updateVisibility: mockUpdateVisibility,
    };
  }),
}));

const mockCountShareVisitors = vi.fn();
vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn(function () {
    return { countShareVisitors: mockCountShareVisitors };
  }),
}));

const mockGetAgentShareMonthlySpend = vi.fn();
vi.mock('@/business/server/agent-share/spendGate', () => ({
  getAgentShareMonthlySpend: (...args: unknown[]) => mockGetAgentShareMonthlySpend(...args),
}));

const mockGetFeatureFlagsState = vi.fn();
vi.mock('@/server/featureFlags', () => ({
  getServerFeatureFlagsStateFromRuntimeConfig: (...args: unknown[]) =>
    mockGetFeatureFlagsState(...args),
}));

const { agentShareConfigPatchSchema, agentShareConfigSchema, agentShareRouter } =
  await import('../agentShare');

const share = {
  agentId: 'agent-1',
  id: 'share-1',
  shareConfig: { maxTopicsPerVisitor: 5, maxTurnsPerTopic: 20 },
  visibility: 'private',
};

describe('agentShareRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.businessConst.ENABLE_BUSINESS_FEATURES = true;
    mockCreate.mockResolvedValue(share);
    mockGetByAgentId.mockResolvedValue(share);
    mockUpdateConfig.mockResolvedValue(share);
    mockUpdateSlug.mockResolvedValue({
      ...share,
      shareConfig: { ...share.shareConfig, slug: 'my-slug' },
    });
    mockUpdateVisibility.mockResolvedValue(share);
    mockCountShareVisitors.mockResolvedValue({ topicCount: 7, visitorCount: 3 });
    mockGetAgentShareMonthlySpend.mockResolvedValue(null);
    mockGetFeatureFlagsState.mockResolvedValue({ enableAgentShare: true });
  });

  it('requires authentication for share management', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner());

    await expect(caller.getShareStatus({ agentId: 'agent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(mockGetByAgentId).not.toHaveBeenCalled();
  });

  // §6.5 retires publishing an agent to external visitors. No share can be
  // created, for either visibility: a row that cannot be published is not a
  // half-open door, it is a row nothing can use, and leaving creation open
  // would keep the capability reachable to whoever gets the `link` value past
  // the `updateVisibility` gate afterwards.
  it('refuses to create a share, for either visibility, without reading the capability flag', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(caller.enableShare({ agentId: 'agent-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      caller.enableShare({ agentId: 'agent-1', visibility: 'link' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockGetFeatureFlagsState).not.toHaveBeenCalled();
  });

  it('returns null when a personal agent has no share', async () => {
    mockGetByAgentId.mockResolvedValue(null);
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(caller.getShareStatus({ agentId: 'agent-1' })).resolves.toBeNull();
  });

  it('forwards an atomic share configuration patch', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));
    const config = { maxTopicsPerVisitor: 10 };

    await caller.updateShareConfig({ agentId: 'agent-1', config });

    expect(mockUpdateConfig).toHaveBeenCalledWith('agent-1', config);
  });

  it('rejects an empty share configuration patch', () => {
    expect(agentShareConfigPatchSchema.safeParse({}).success).toBe(false);
  });

  it('requires positive integer topic and turn limits', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { maxTopicsPerVisitor: 0 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { maxTurnsPerTopic: 1.5 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('caps maxTopicsPerVisitor at the visitor topic list limit', async () => {
    // The visitor topic list (`TopicModel.queryBySender`) is not paginated
    // and is bounded by `AGENT_SHARE_VISITOR_TOPIC_LIST_LIMIT` (200), so a
    // cap above it would let visitors create topics they can never reopen.
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { maxTopicsPerVisitor: 201 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockUpdateConfig).not.toHaveBeenCalled();

    await caller.updateShareConfig({
      agentId: 'agent-1',
      config: { maxTopicsPerVisitor: 200 },
    });
    expect(mockUpdateConfig).toHaveBeenCalledWith('agent-1', { maxTopicsPerVisitor: 200 });
  });

  it('accepts a toolset-level grant and a per-API scoped grant in toolGrants', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));
    const config = {
      toolGrants: [
        { identifier: 'calculator' },
        { apis: ['analyzeMedia'], identifier: 'orvilo-agent' },
      ],
    };

    await caller.updateShareConfig({ agentId: 'agent-1', config });

    expect(mockUpdateConfig).toHaveBeenCalledWith('agent-1', config);
  });

  it('rejects a malformed toolGrants entry', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    // Empty identifier.
    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { toolGrants: [{ identifier: '' }] },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // Empty `apis` array — a tool with no granted API must be absent instead.
    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { toolGrants: [{ apis: [], identifier: 'orvilo-agent' }] },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // Unknown key.
    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { toolGrants: [{ apiName: 'analyzeMedia', identifier: 'orvilo-agent' } as any] },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('rejects duplicate identifiers and duplicate api names in toolGrants', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { toolGrants: [{ identifier: 'calculator' }, { identifier: 'calculator' }] },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: {
          toolGrants: [{ apis: ['analyzeMedia', 'analyzeMedia'], identifier: 'orvilo-agent' }],
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('does not expose dropped v1 config fields in the config API', () => {
    expect(
      agentShareConfigSchema.safeParse({
        filePermissionConfig: { agentFiles: 'read' },
        maxTopicsPerVisitor: 5,
      }).success,
    ).toBe(false);
    expect(
      agentShareConfigSchema.safeParse({
        guestEnabled: true,
        maxTopicsPerVisitor: 5,
      }).success,
    ).toBe(false);
  });

  // Disabling is a pause, not a revocation: it flips the row to `private` and
  // never deletes it, so the share id and slug (i.e. the link already handed
  // out) survive. Since §6.5 retired publishing, re-enabling is refused — the
  // row survives so that an owner can still review and revoke what exists, not
  // so that it can be republished.
  it('disables an existing share by making it private, keeping the row', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    const disabled = await caller.disableShare({ agentId: 'agent-1' });

    expect(mockUpdateVisibility).toHaveBeenCalledWith('agent-1', 'private');
    expect(mockUpdateVisibility).toHaveBeenCalledTimes(1);
    expect(disabled.id).toBe('share-1');
  });

  it('updates the custom slug', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    const result = await caller.updateSlug({ agentId: 'agent-1', slug: 'my-slug' });

    expect(mockUpdateSlug).toHaveBeenCalledWith('agent-1', 'my-slug');
    expect(result.shareConfig).toMatchObject({ slug: 'my-slug' });
  });

  it('lower-cases and trims the slug input before forwarding it', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await caller.updateSlug({ agentId: 'agent-1', slug: '  My-Slug  ' });

    expect(mockUpdateSlug).toHaveBeenCalledWith('agent-1', 'my-slug');
  });

  it('rejects an obviously too-short slug before reaching the model', async () => {
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(caller.updateSlug({ agentId: 'agent-1', slug: 'ab' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(mockUpdateSlug).not.toHaveBeenCalled();
  });

  it('propagates a slug conflict as CONFLICT', async () => {
    mockUpdateSlug.mockRejectedValue(
      new TRPCError({ code: 'CONFLICT', message: 'SHARE_SLUG_TAKEN' }),
    );
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(
      caller.updateSlug({ agentId: 'agent-1', slug: 'taken-slug' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('returns NOT_FOUND when an existing share is required', async () => {
    mockUpdateConfig.mockResolvedValue(null);
    mockUpdateVisibility.mockResolvedValue(null);
    mockUpdateSlug.mockResolvedValue(null);
    const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

    await expect(caller.disableShare({ agentId: 'agent-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      caller.updateShareConfig({
        agentId: 'agent-1',
        config: { maxTopicsPerVisitor: 5 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller.updateVisibility({ agentId: 'agent-1', visibility: 'private' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller.updateSlug({ agentId: 'agent-1', slug: 'my-slug' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // §6.5 retires publishing to visitors unconditionally. The refusal is a
  // complete choke point rather than a flag-gated one: a persisted feature
  // flag, an older client or a still-valid visitor token must not be able to
  // re-open it, so there is no branch for a configuration to switch on. These
  // cases pin that — including that the capability flag is no longer read at
  // all, which is what makes the retirement un-reopenable rather than merely
  // off by default.
  //
  // A separate "deployment without business features" case used to sit here. It
  // passed both before and after the retirement (the old gate refused on that
  // config too), so it pinned nothing about this change and is gone; the deploy
  // flag's real consumer is the read-path gate, covered in
  // `_helpers/__tests__/agentShareFeatureGate.test.ts`, `share.test.ts` and
  // `shareChat.test.ts`.
  describe('publishing to visitors is retired', () => {
    it.each([
      ['the capability on', { enableAgentShare: true }],
      ['the capability off', { enableAgentShare: false }],
      ['the capability unconfigured', {}],
    ])('refuses to create a share with %s, and never reads the flag', async (_label, flags) => {
      mockGetFeatureFlagsState.mockResolvedValue(flags);
      const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

      await expect(caller.enableShare({ agentId: 'agent-1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockGetFeatureFlagsState).not.toHaveBeenCalled();
    });

    // The `link` visibility is the publish action on an existing row, so it is
    // refused while `private` (below) is not.
    it('refuses to publish an existing share by setting it to a link', async () => {
      const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

      await expect(
        caller.updateVisibility({ agentId: 'agent-1', visibility: 'link' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mockUpdateVisibility).not.toHaveBeenCalled();
    });

    // The promise the refusal message makes: an owner can still take a share
    // down, read it and manage it. Retiring publishing must not strand existing
    // shares in a state nobody can revoke.
    it('still lets an owner unpublish, read and manage an existing share', async () => {
      const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

      await caller.updateVisibility({ agentId: 'agent-1', visibility: 'private' });
      await caller.disableShare({ agentId: 'agent-1' });
      await caller.getShareStatus({ agentId: 'agent-1' });
      await caller.updateShareConfig({ agentId: 'agent-1', config: { maxTurnsPerTopic: 3 } });

      expect(mockUpdateVisibility).toHaveBeenCalledWith('agent-1', 'private');
      expect(mockUpdateVisibility).toHaveBeenCalledTimes(2);
    });
  });

  describe('getShareStats', () => {
    it('returns visitor aggregates and the configured cap for the owner', async () => {
      mockGetByAgentId.mockResolvedValue({
        ...share,
        shareConfig: { ...share.shareConfig, monthlySpendLimit: 10 },
        userViewCount: 42,
      });
      mockGetAgentShareMonthlySpend.mockResolvedValue(2.5);
      const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

      await expect(caller.getShareStats({ agentId: 'agent-1' })).resolves.toEqual({
        monthlySpend: 2.5,
        monthlySpendLimit: 10,
        topicCount: 7,
        userViewCount: 42,
        visitorCount: 3,
      });
      expect(mockCountShareVisitors).toHaveBeenCalledWith({ agentId: 'agent-1' });
      expect(mockGetAgentShareMonthlySpend).toHaveBeenCalledWith({
        agentId: 'agent-1',
        ownerUserId: 'user-1',
      });
    });

    it('reports unknown spend as null rather than zero', async () => {
      const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-1' }));

      const stats = await caller.getShareStats({ agentId: 'agent-1' });

      expect(stats.monthlySpend).toBeNull();
    });

    it('refuses stats for an agent the caller does not own', async () => {
      // `getByAgentId` is ownership-scoped, so a non-owner resolves to null.
      mockGetByAgentId.mockResolvedValue(null);
      const caller = agentShareRouter.createCaller(await createContextInner({ userId: 'user-2' }));

      await expect(caller.getShareStats({ agentId: 'agent-1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockCountShareVisitors).not.toHaveBeenCalled();
      expect(mockGetAgentShareMonthlySpend).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      const caller = agentShareRouter.createCaller(await createContextInner());

      await expect(caller.getShareStats({ agentId: 'agent-1' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });
});
