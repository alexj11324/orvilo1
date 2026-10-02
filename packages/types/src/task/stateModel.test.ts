import { describe, expect, it } from 'vitest';

import type { TaskDispatchPhase, TaskRunState } from './index';
import { deriveTaskExecutionState } from './stateModel';

const project = (dispatchPhase?: TaskDispatchPhase, runState?: TaskRunState) =>
  deriveTaskExecutionState({ dispatchPhase, runState });

describe('deriveTaskExecutionState', () => {
  it('maps pre-run dispatch phases onto queued/provisioning', () => {
    expect(project('requested')).toBe('queued');
    expect(project('claimed')).toBe('queued');
    expect(project('provisioning')).toBe('provisioning');
  });

  it('maps in-flight dispatch and run rows onto running', () => {
    expect(project('dispatched')).toBe('running');
    expect(project('running')).toBe('running');
    expect(project('cancel_requested')).toBe('running');
    expect(project(undefined, 'queued')).toBe('queued');
    expect(project(undefined, 'running')).toBe('running');
    expect(project(undefined, 'cancel_requested')).toBe('running');
  });

  it('lets a waiting run row surface ahead of a still-running dispatch', () => {
    expect(project('running', 'waiting')).toBe('waiting');
    expect(project(undefined, 'waiting')).toBe('waiting');
    expect(project('waiting', 'running')).toBe('waiting');
  });

  it('projects terminal rows onto their canonical execution state', () => {
    expect(project('succeeded', 'succeeded')).toBe('succeeded');
    expect(project('failed', 'failed')).toBe('failed');
    expect(project('canceled', 'canceled')).toBe('canceled');
    expect(project('outcome_unknown', 'outcome_unknown')).toBe('outcome_unknown');
  });

  it('keeps the terminal dispatch row authoritative over a stale run row', () => {
    // The run row lags the contract settle — the fence already won.
    expect(project('succeeded', 'running')).toBe('succeeded');
    expect(project('canceled', 'running')).toBe('canceled');
    expect(project('failed', 'running')).toBe('failed');
  });

  it('surfaces a terminal run row the dispatch has not settled yet', () => {
    // Run reported a terminal state while the dispatch row still reads
    // running — the run row is the freshest signal.
    expect(project('running', 'succeeded')).toBe('succeeded');
    expect(project('running', 'failed')).toBe('failed');
    expect(project('running', 'outcome_unknown')).toBe('outcome_unknown');
  });

  it('reads an abandoned dispatch as outcome_unknown', () => {
    expect(project('abandoned', 'running')).toBe('outcome_unknown');
    expect(project('abandoned')).toBe('outcome_unknown');
  });

  it('falls back to the legacy status only when no execution rows exist', () => {
    expect(deriveTaskExecutionState({ legacyStatus: 'running' })).toBe('running');
    expect(deriveTaskExecutionState({ legacyStatus: 'paused' })).toBe('outcome_unknown');
    expect(deriveTaskExecutionState({ legacyStatus: 'completed' })).toBe('succeeded');
    expect(deriveTaskExecutionState({ legacyStatus: 'failed' })).toBe('failed');
    expect(deriveTaskExecutionState({ legacyStatus: 'canceled' })).toBe('canceled');
  });

  it('returns null when there is no execution to project', () => {
    expect(deriveTaskExecutionState({})).toBeNull();
    expect(deriveTaskExecutionState({ legacyStatus: 'backlog' })).toBeNull();
    expect(deriveTaskExecutionState({ legacyStatus: 'scheduled' })).toBeNull();
  });
});
