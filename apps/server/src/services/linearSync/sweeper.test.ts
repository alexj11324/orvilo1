import { describe, expect, it, vi } from 'vitest';

import {
  linearSyncInstallationHasBacklog,
  type LinearSyncSweepInstallation,
  selectLinearSyncSweepInstallations,
  sweepLinearSyncInstallations,
} from './sweeper';

const date = (value: string) => new Date(value);

const installation = (
  overrides: Partial<LinearSyncSweepInstallation> = {},
): LinearSyncSweepInstallation => ({
  id: 'installation-1',
  inbox: { count: 0, oldestAt: null },
  outbox: { count: 0, oldestAt: null },
  planning: { count: 0, oldestAt: null },
  planningOwner: true,
  status: 'active',
  workspaceId: 'workspace-1',
  ...overrides,
});

describe('selectLinearSyncSweepInstallations', () => {
  it('does not let no-backlog installations hide a later actionable installation', () => {
    const installations = Array.from({ length: 101 }, (_, index) => ({
      id: `installation-${index + 1}`,
      status: 'active' as const,
      workspaceId: 'workspace-1',
    }));
    const discovery = selectLinearSyncSweepInstallations({
      inboxRows: [
        {
          count: 1,
          installationId: 'installation-101',
          oldestAt: date('2026-09-16T19:00:00.000Z'),
        },
      ],
      installations,
      maxInstallations: 100,
      now: date('2026-09-16T20:00:00.000Z'),
      outboxRows: [],
      planningRows: [],
    });

    expect(discovery.installations.map(({ id }) => id)).toEqual(['installation-101']);
  });

  it('exposes planning backlog with no active installation without scheduling a workflow', async () => {
    const discovery = selectLinearSyncSweepInstallations({
      inboxRows: [],
      installations: [],
      planningRows: [
        {
          count: 2,
          oldestAt: date('2026-09-16T18:55:00.000Z'),
          workspaceId: 'workspace-without-linear',
        },
      ],
      outboxRows: [],
    });
    const trigger = vi.fn();

    const result = await sweepLinearSyncInstallations({
      installations: discovery.installations,
      planningBacklog: discovery.planningBacklog,
      triggerInstallation: trigger,
    });

    expect(discovery.installations).toHaveLength(0);
    expect(discovery.planningBacklog).toEqual([
      {
        summary: { count: 2, oldestAt: date('2026-09-16T18:55:00.000Z') },
        workspaceId: 'workspace-without-linear',
      },
    ]);
    expect(result).toMatchObject({ planningBacklog: 2, scheduled: 0 });
    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('sweepLinearSyncInstallations', () => {
  it('reschedules durable inbox and outbox rows after the original trigger was lost', async () => {
    const trigger = vi.fn().mockResolvedValue({ workflowRunId: 'recovered' });
    const result = await sweepLinearSyncInstallations({
      installations: [
        installation({
          inbox: { count: 2, oldestAt: date('2026-09-16T19:00:00.000Z') },
          outbox: { count: 3, oldestAt: date('2026-09-16T19:05:00.000Z') },
          planning: { count: 1, oldestAt: date('2026-09-16T18:55:00.000Z') },
        }),
      ],
      triggerInstallation: trigger,
      workflowLimit: 7,
    });

    expect(result).toMatchObject({
      failed: 0,
      inboxBacklog: 2,
      outboxBacklog: 3,
      planningBacklog: 1,
      scheduled: 1,
    });
    expect(result.oldestBacklogAt).toBe('2026-09-16T18:55:00.000Z');
    expect(trigger).toHaveBeenCalledOnce();
    expect(trigger).toHaveBeenCalledWith({
      installationId: 'installation-1',
      limit: 7,
      workspaceId: 'workspace-1',
    });
  });

  it('does not reschedule a row whose active lease was excluded from discovery', async () => {
    const trigger = vi.fn();
    const leasedOnly = installation();

    expect(linearSyncInstallationHasBacklog(leasedOnly)).toBe(false);
    await expect(
      sweepLinearSyncInstallations({
        installations: [leasedOnly],
        triggerInstallation: trigger,
      }),
    ).resolves.toMatchObject({ scheduled: 0, skippedNoBacklog: 1 });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('skips revoked installations even when durable rows remain', async () => {
    const trigger = vi.fn();
    const result = await sweepLinearSyncInstallations({
      installations: [
        installation({
          inbox: { count: 1, oldestAt: date('2026-09-16T19:00:00.000Z') },
          status: 'revoked',
        }),
      ],
      triggerInstallation: trigger,
    });

    expect(result).toMatchObject({ inactiveInstallations: 1, scheduled: 0 });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('keeps repeated sweeps safe after the first workflow claims the backlog', async () => {
    const pending = installation({
      inbox: { count: 1, oldestAt: date('2026-09-16T19:00:00.000Z') },
      outbox: { count: 1, oldestAt: date('2026-09-16T19:01:00.000Z') },
    });
    const trigger = vi.fn(async () => {
      // Fault-injection harness: the installation worker claims and settles
      // both rows before the next cron tick scans the durable state.
      pending.inbox = { count: 0, oldestAt: null };
      pending.outbox = { count: 0, oldestAt: null };
    });

    await sweepLinearSyncInstallations({ installations: [pending], triggerInstallation: trigger });
    const repeated = await sweepLinearSyncInstallations({
      installations: [pending],
      triggerInstallation: trigger,
    });

    expect(trigger).toHaveBeenCalledOnce();
    expect(repeated).toMatchObject({ scheduled: 0, skippedNoBacklog: 1 });
  });

  it('schedules one installation workflow for a multi-row backlog and respects the cap', async () => {
    const trigger = vi.fn().mockResolvedValue(undefined);
    const installations = Array.from({ length: 3 }, (_, index) =>
      installation({
        id: `installation-${index + 1}`,
        inbox: { count: 10, oldestAt: date('2026-09-16T19:00:00.000Z') },
      }),
    );

    const result = await sweepLinearSyncInstallations({
      installations,
      maxScheduledInstallations: 2,
      triggerInstallation: trigger,
    });

    expect(result).toMatchObject({ scheduled: 2, truncated: 1 });
    expect(trigger).toHaveBeenCalledTimes(2);
  });
});
