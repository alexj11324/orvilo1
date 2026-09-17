import type { LinearIssueLinkSyncState } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  getLinearBindingRollout,
  getLinearRecoverySummary,
  getScopedProjects,
  getWizardStepStates,
  isCatalogOrganization,
  isLinearImportInProgress,
  summarizeIssueLinks,
} from './linearSyncViewModel';

const link = (syncState: LinearIssueLinkSyncState) =>
  ({
    id: `link-${syncState}`,
    lastConfirmedSnapshot: { id: syncState, identifier: syncState, title: syncState },
    linearIdentifier: syncState,
    syncState,
    taskId: `task-${syncState}`,
  }) as any;

describe('linear sync view model', () => {
  it('summarizes safe recovery rows by actionable status', () => {
    expect(
      getLinearRecoverySummary([
        { status: 'failed' },
        { status: 'dead_letter' },
        { status: 'outcome_unknown' },
        { status: 'failed' },
      ] as any),
    ).toEqual({ deadLetter: 1, failed: 2, outcomeUnknown: 1, total: 4 });
  });
  it('requires a catalog organization instead of accepting a typed id', () => {
    expect(isCatalogOrganization([{ id: 'org-1' }], 'org-1')).toBe(true);
    expect(isCatalogOrganization([{ id: 'org-1' }], 'org-typed-by-user')).toBe(false);
  });

  it('filters remote projects by the selected team while keeping the full catalog available', () => {
    const projects = [
      { id: 'project-1', teamIds: ['team-1'] },
      { id: 'project-2', teamIds: ['team-2'] },
    ];

    expect(getScopedProjects(projects, 'team-1').map((project) => project.id)).toEqual([
      'project-1',
    ]);
    expect(getScopedProjects(projects).map((project) => project.id)).toEqual([
      'project-1',
      'project-2',
    ]);
  });

  it('summarizes the issue-link states without creating a second task collection', () => {
    const summary = summarizeIssueLinks([
      link('synced'),
      link('pending'),
      link('conflict'),
      link('outcome_unknown'),
      link('removed'),
      link('unlinked'),
    ]);

    expect(summary).toEqual({
      conflict: 1,
      outcomeUnknown: 1,
      pending: 1,
      removed: 2,
      synced: 1,
      total: 6,
    });
  });

  it('gates automation behind a saved binding and enabled sync', () => {
    expect(
      getWizardStepStates({
        hasBinding: true,
        hasScope: true,
        installationIsActive: true,
        isConnected: true,
        isSyncEnabled: false,
      }).automation.enabled,
    ).toBe(false);
    expect(
      getWizardStepStates({
        hasBinding: true,
        hasScope: true,
        installationIsActive: true,
        isConnected: true,
        isSyncEnabled: true,
      }).automation.enabled,
    ).toBe(true);
  });

  it('inherits legacy syncEnabled for bindings without rollout fields', () => {
    expect(getLinearBindingRollout({ settings: {}, syncEnabled: true })).toEqual({
      readEnabled: true,
      writeEnabled: true,
    });
  });

  it('keeps inbound and outbound controls independent', () => {
    expect(
      getLinearBindingRollout({
        settings: { readEnabled: false, writeEnabled: true },
        syncEnabled: true,
      }),
    ).toEqual({ readEnabled: false, writeEnabled: true });
  });

  it('keeps an incomplete import visibly resumable after a blocked page', () => {
    expect(isLinearImportInProgress({ importCursor: null, importPhase: 'initial' }, false)).toBe(
      true,
    );
    expect(isLinearImportInProgress({ importCursor: 'cursor-1', importPhase: 'initial' })).toBe(
      true,
    );
    expect(isLinearImportInProgress({ importCursor: null, importPhase: 'completed' }, true)).toBe(
      false,
    );
  });
});
