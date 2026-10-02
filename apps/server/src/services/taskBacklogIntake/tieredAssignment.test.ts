// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ProjectAgentRosterEntry,
  TaskBacklogIntakeCandidate,
} from '@/database/models/taskDispatch';

import {
  pickTieredAgent,
  resolveBacklogIntakeAssignment,
  resolveRequiredAgentTier,
} from './tieredAssignment';

const mocks = vi.hoisted(() => ({
  findLatestTerminalDispatch: vi.fn(),
  findUsableAgentExecutionBinding: vi.fn(),
  listProjectAgentRoster: vi.fn(),
  taskFindById: vi.fn(),
  taskRequiresBuiltinToolMount: vi.fn(),
}));

vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: Object.assign(vi.fn(), {
    findLatestTerminalDispatch: mocks.findLatestTerminalDispatch,
    listProjectAgentRoster: mocks.listProjectAgentRoster,
  }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { findById: mocks.taskFindById };
  }),
}));
vi.mock('@/database/models/project', () => ({
  normalizeProjectOrchestrationPolicy: (policy: unknown) => policy,
}));
vi.mock('@/database/utils/agent-access', () => ({
  findUsableAgentExecutionBinding: mocks.findUsableAgentExecutionBinding,
}));
vi.mock('@/server/services/taskRunner/toolMountRequirement', () => ({
  taskRequiresBuiltinToolMount: mocks.taskRequiresBuiltinToolMount,
}));

const rosterEntry = (
  overrides: Partial<ProjectAgentRosterEntry> = {},
): ProjectAgentRosterEntry => ({
  agencyConfig: null,
  agentId: 'agent-1',
  model: null,
  role: null,
  sortOrder: 0,
  tier: 'mid',
  ...overrides,
});

describe('resolveRequiredAgentTier', () => {
  it('derives the required band from task priority alone', () => {
    expect(resolveRequiredAgentTier({ priority: 1 }).required).toBe('high');
    expect(resolveRequiredAgentTier({ priority: 3 }).required).toBe('mid');
    expect(resolveRequiredAgentTier({ priority: 0 }).required).toBe('low');
  });

  it('escalates one band after a terminally failed orchestrated attempt', () => {
    const lastTerminal = {
      phase: 'failed' as const,
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'low' as const,
    };
    expect(resolveRequiredAgentTier({ lastTerminal, priority: 4 })).toEqual({
      escalatedFrom: 'low',
      required: 'mid',
    });
  });

  it('escalates an abandoned orchestrated attempt too', () => {
    const lastTerminal = {
      phase: 'abandoned' as const,
      requestedBy: 'orchestrator:planner',
      tier: 'mid' as const,
    };
    expect(resolveRequiredAgentTier({ lastTerminal, priority: 0 })).toEqual({
      escalatedFrom: 'mid',
      required: 'high',
    });
  });

  it('cannot escalate past the top band', () => {
    const lastTerminal = {
      phase: 'failed' as const,
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'high' as const,
    };
    expect(resolveRequiredAgentTier({ lastTerminal, priority: 0 })).toEqual({
      escalatedFrom: null,
      required: 'low',
    });
  });

  it('does not escalate non-failure verdicts, manual runs or unrecorded tiers', () => {
    for (const lastTerminal of [
      { phase: 'succeeded', requestedBy: 'orchestrator:backlog_intake', tier: 'low' },
      { phase: 'canceled', requestedBy: 'orchestrator:backlog_intake', tier: 'low' },
      { phase: 'failed', requestedBy: 'manual:user-1', tier: 'low' },
      { phase: 'failed', requestedBy: 'orchestrator:backlog_intake', tier: null },
    ] as const) {
      expect(resolveRequiredAgentTier({ lastTerminal, priority: 4 })).toEqual({
        escalatedFrom: null,
        required: 'low',
      });
    }
  });

  it('keeps the higher priority baseline when it already exceeds the escalation', () => {
    const lastTerminal = {
      phase: 'failed' as const,
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'low' as const,
    };
    // Escalation to 'mid' loses to the priority-implied 'high'.
    expect(resolveRequiredAgentTier({ lastTerminal, priority: 1 })).toEqual({
      escalatedFrom: null,
      required: 'high',
    });
  });
});

describe('pickTieredAgent', () => {
  const policy = {};

  it('picks the cheapest band that satisfies the requirement', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: null,
        policy,
        required: 'mid',
        roster: [
          rosterEntry({ agentId: 'cheap', tier: 'low' }),
          rosterEntry({ agentId: 'mid', sortOrder: 1, tier: 'mid' }),
          rosterEntry({ agentId: 'strong', sortOrder: 2, tier: 'high' }),
        ],
      }),
    ).toBe('mid');
  });

  it('lets a higher band satisfy a lower requirement', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: null,
        policy,
        required: 'low',
        roster: [rosterEntry({ agentId: 'strong', tier: 'high' })],
      }),
    ).toBe('strong');
  });

  it('returns null when no roster agent satisfies — the graceful fallback', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: 'cheap',
        policy,
        required: 'high',
        roster: [rosterEntry({ agentId: 'cheap', tier: 'low' })],
      }),
    ).toBeNull();
  });

  it('treats untiered roster rows as satisfying nothing', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: null,
        policy,
        required: 'low',
        roster: [rosterEntry({ agentId: 'unbanded', tier: null })],
      }),
    ).toBeNull();
  });

  it('honors the allowedAgentIds gate', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: null,
        policy: { allowedAgentIds: ['strong'] },
        required: 'low',
        roster: [
          rosterEntry({ agentId: 'cheap', tier: 'low' }),
          rosterEntry({ agentId: 'strong', sortOrder: 1, tier: 'high' }),
        ],
      }),
    ).toBe('strong');
  });

  it('honors the allowedRoles gate', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: null,
        policy: { allowedRoles: ['researcher'] },
        required: 'low',
        roster: [
          rosterEntry({ agentId: 'worker', role: 'implementer', tier: 'low' }),
          rosterEntry({ agentId: 'researcher', role: 'researcher', sortOrder: 1, tier: 'mid' }),
        ],
      }),
    ).toBe('researcher');
  });

  it('prefers the incumbent assignee among equally cheap candidates', () => {
    expect(
      pickTieredAgent({
        currentAssigneeAgentId: 'second',
        policy,
        required: 'low',
        roster: [
          rosterEntry({ agentId: 'first', tier: 'low' }),
          rosterEntry({ agentId: 'second', sortOrder: 1, tier: 'low' }),
        ],
      }),
    ).toBe('second');
  });

  describe('when the task needs the builtin tool surface', () => {
    const mountRoster = [
      rosterEntry({
        agencyConfig: { heterogeneousProvider: { type: 'pi' } },
        agentId: 'pi-agent',
        tier: 'low',
      }),
      rosterEntry({
        agencyConfig: { heterogeneousProvider: { type: 'devin' } },
        agentId: 'devin-agent',
        sortOrder: 1,
        tier: 'low',
      }),
      rosterEntry({ agentId: 'capable', sortOrder: 2, tier: 'low' }),
    ];

    it('skips mount-incapable agents — including pi, transport-capable but silent-dropping mcpServers', () => {
      expect(
        pickTieredAgent({
          currentAssigneeAgentId: null,
          policy,
          required: 'low',
          requiresToolSurfaceMount: true,
          roster: mountRoster,
        }),
      ).toBe('capable');
    });

    it('returns null when only mount-incapable agents satisfy', () => {
      expect(
        pickTieredAgent({
          currentAssigneeAgentId: 'devin-agent',
          policy,
          required: 'low',
          requiresToolSurfaceMount: true,
          roster: mountRoster.slice(0, 2),
        }),
      ).toBeNull();
    });

    it('keeps those same agents fully pickable for normal tasks', () => {
      expect(
        pickTieredAgent({
          currentAssigneeAgentId: null,
          policy,
          required: 'low',
          roster: mountRoster,
        }),
      ).toBe('pi-agent');
      expect(
        pickTieredAgent({
          currentAssigneeAgentId: null,
          policy,
          required: 'low',
          requiresToolSurfaceMount: false,
          roster: mountRoster,
        }),
      ).toBe('pi-agent');
    });
  });
});

describe('resolveBacklogIntakeAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLatestTerminalDispatch.mockResolvedValue(undefined);
    mocks.findUsableAgentExecutionBinding.mockResolvedValue({ agencyConfig: null, model: null });
    mocks.listProjectAgentRoster.mockResolvedValue([]);
    mocks.taskFindById.mockResolvedValue({});
    mocks.taskRequiresBuiltinToolMount.mockResolvedValue(false);
  });

  const candidate = (
    overrides: Partial<TaskBacklogIntakeCandidate> = {},
  ): TaskBacklogIntakeCandidate => ({
    assigneeAgentId: 'agent-cheap',
    createdBySubjectId: null,
    createdByUserId: 'user-1',
    executionGeneration: 1,
    orchestrationPolicy: { autoDispatch: true, replanMode: 'disabled', requireHumanReview: false },
    priority: 4,
    projectId: 'project-1',
    taskId: 'task-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    ...overrides,
  });

  it('joins the durable failure record and the roster into one pick', async () => {
    mocks.findLatestTerminalDispatch.mockResolvedValue({
      agentId: 'agent-cheap',
      generation: 3,
      phase: 'failed',
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'low',
    });
    mocks.listProjectAgentRoster.mockResolvedValue([
      rosterEntry({ agentId: 'agent-cheap', tier: 'low' }),
      rosterEntry({ agentId: 'agent-mid', sortOrder: 1, tier: 'mid' }),
    ]);

    await expect(
      resolveBacklogIntakeAssignment({ candidate: candidate(), db: {} as never }),
    ).resolves.toEqual({ agentId: 'agent-mid', escalatedFrom: 'low', required: 'mid' });
    expect(mocks.findLatestTerminalDispatch).toHaveBeenCalledWith(
      {},
      { taskId: 'task-1', workspaceId: 'workspace-1' },
    );
    expect(mocks.listProjectAgentRoster).toHaveBeenCalledWith(
      {},
      { projectId: 'project-1', workspaceId: 'workspace-1' },
    );
  });

  it('reports a null pick when the roster cannot satisfy the requirement', async () => {
    mocks.listProjectAgentRoster.mockResolvedValue([
      rosterEntry({ agentId: 'agent-cheap', tier: 'low' }),
    ]);

    await expect(
      resolveBacklogIntakeAssignment({ candidate: candidate({ priority: 1 }), db: {} as never }),
    ).resolves.toEqual({ agentId: null, escalatedFrom: null, required: 'high' });
  });

  it('picks a mount-capable roster agent when the task needs the builtin surface', async () => {
    mocks.taskRequiresBuiltinToolMount.mockResolvedValue(true);
    mocks.listProjectAgentRoster.mockResolvedValue([
      rosterEntry({
        agencyConfig: { heterogeneousProvider: { type: 'devin' } },
        agentId: 'agent-devin',
        tier: 'low',
      }),
      rosterEntry({ agentId: 'agent-claude', sortOrder: 1, tier: 'low' }),
    ]);

    await expect(
      resolveBacklogIntakeAssignment({ candidate: candidate(), db: {} as never }),
    ).resolves.toEqual({ agentId: 'agent-claude', escalatedFrom: null, required: 'low' });
    // The pick succeeded — the kept-assignee capability probe never ran.
    expect(mocks.findUsableAgentExecutionBinding).not.toHaveBeenCalled();
  });

  it('blocks when the kept assignee cannot mount the builtin surface and nothing can replace it', async () => {
    mocks.taskRequiresBuiltinToolMount.mockResolvedValue(true);
    mocks.findUsableAgentExecutionBinding.mockResolvedValue({
      agencyConfig: { heterogeneousProvider: { type: 'pi' } },
      model: null,
    });

    await expect(
      resolveBacklogIntakeAssignment({ candidate: candidate(), db: {} as never }),
    ).resolves.toEqual({
      agentId: null,
      blockedReason: 'assignee_engine_cannot_mount_builtin_tool_surface',
      escalatedFrom: null,
      required: 'low',
    });
  });

  it('blocks with its own reason when the kept assignee is no longer usable', async () => {
    mocks.taskRequiresBuiltinToolMount.mockResolvedValue(true);
    mocks.findUsableAgentExecutionBinding.mockResolvedValue(null);

    await expect(
      resolveBacklogIntakeAssignment({ candidate: candidate(), db: {} as never }),
    ).resolves.toEqual({
      agentId: null,
      blockedReason: 'assignee_agent_unusable',
      escalatedFrom: null,
      required: 'low',
    });
  });

  it('leaves a mount-capable kept assignee unblocked — the pre-tiering path', async () => {
    mocks.taskRequiresBuiltinToolMount.mockResolvedValue(true);

    const result = await resolveBacklogIntakeAssignment({
      candidate: candidate(),
      db: {} as never,
    });
    expect(result).toEqual({ agentId: null, escalatedFrom: null, required: 'low' });
    expect(result.blockedReason).toBeUndefined();
  });

  it('never blocks a normal task, whatever the kept assignee runs on', async () => {
    // taskRequiresBuiltinToolMount stays false — a devin assignee stays usable.
    mocks.findUsableAgentExecutionBinding.mockResolvedValue({
      agencyConfig: { heterogeneousProvider: { type: 'devin' } },
      model: null,
    });

    const result = await resolveBacklogIntakeAssignment({
      candidate: candidate(),
      db: {} as never,
    });
    expect(result.blockedReason).toBeUndefined();
    expect(mocks.findUsableAgentExecutionBinding).not.toHaveBeenCalled();
  });
});
