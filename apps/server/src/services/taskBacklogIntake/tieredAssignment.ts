import type { AgentTier, ProjectOrchestrationPolicy } from '@orvilo/types';
import { agentTierRank, nextAgentTier, requiredAgentTierForPriority } from '@orvilo/types';

import { normalizeProjectOrchestrationPolicy } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import {
  type ProjectAgentRosterEntry,
  type TaskBacklogIntakeCandidate,
  TaskDispatchModel,
  type TaskTerminalDispatchOutcome,
} from '@/database/models/taskDispatch';
import { type OrviloDatabase } from '@/database/type';
import { findUsableAgentExecutionBinding } from '@/database/utils/agent-access';
import { agentCanMountBuiltinToolSurface } from '@/server/services/aiAgent/pipeline/resolveExecutionBinding';
import { taskRequiresBuiltinToolMount } from '@/server/services/taskRunner/toolMountRequirement';

/**
 * Outcome of the terminal dispatch that drives escalation: only an
 * orchestrated run that ended `failed`/`abandoned` with a recorded tier
 * escalates. `canceled`/`succeeded` verdicts and manual runs leave the base
 * requirement alone, and a `waiting` intent never reaches this set at all.
 */
const ESCALATABLE_PHASES = new Set(['abandoned', 'failed']);
const ORCHESTRATED_REQUEST_PREFIX = 'orchestrator:';

/**
 * The band the next attempt must run at: the task's priority baseline, raised
 * one step above the tier a terminally failed orchestrated attempt ran at
 * (FrugalGPT escalate-on-failure). An attempt already at the top band — or one
 * that left no tier record — cannot escalate, so the requirement falls back
 * to the baseline and the existing failure path owns the outcome.
 */
export const resolveRequiredAgentTier = (input: {
  lastTerminal?: Pick<TaskTerminalDispatchOutcome, 'phase' | 'requestedBy' | 'tier'>;
  priority: number | null;
}): { escalatedFrom: AgentTier | null; required: AgentTier } => {
  const required = requiredAgentTierForPriority(input.priority);
  const last = input.lastTerminal;
  if (
    last &&
    ESCALATABLE_PHASES.has(last.phase) &&
    last.tier !== null &&
    last.requestedBy.startsWith(ORCHESTRATED_REQUEST_PREFIX)
  ) {
    const escalated = nextAgentTier(last.tier);
    if (escalated && agentTierRank(escalated) > agentTierRank(required)) {
      return { escalatedFrom: last.tier, required: escalated };
    }
  }
  return { escalatedFrom: null, required };
};

/**
 * Cheap-first agent selection (FrugalGPT): among enabled roster rows that
 * satisfy the existing eligibility gates (`allowedAgentIds`, `allowedRoles`),
 * pick the lowest band meeting `required`. The current assignee wins ties so
 * the matcher does not churn assignments between equal-cost agents; roster
 * order breaks the rest. Returns `null` when nothing satisfies — the caller
 * keeps the task's assignee, which is exactly the pre-tiering behavior.
 * Untiered roster rows satisfy no requirement, so an all-untiered roster is
 * a guaranteed no-op (opt-in by data, not by flag).
 */
export const pickTieredAgent = (input: {
  currentAssigneeAgentId: string | null;
  policy: Pick<ProjectOrchestrationPolicy, 'allowedAgentIds' | 'allowedRoles'>;
  required: AgentTier;
  /**
   * When the task's contract requires the builtin/MCP tool surface (goal-mode
   * work, acceptance evidence), only agents whose engine can mount it are
   * eligible — the same predicate dispatch admission enforces later. Normal
   * tasks leave this unset: a mount-incapable agent stays fully pickable for
   * them, never excluded wholesale.
   */
  requiresToolSurfaceMount?: boolean;
  roster: ProjectAgentRosterEntry[];
}): string | null => {
  const requiredRank = agentTierRank(input.required);
  const satisfying = input.roster.flatMap((entry) => {
    if (entry.tier === null || agentTierRank(entry.tier) < requiredRank) return [];
    if (
      input.requiresToolSurfaceMount &&
      !agentCanMountBuiltinToolSurface({ agencyConfig: entry.agencyConfig }, entry.model)
    ) {
      return [];
    }
    if (
      input.policy.allowedAgentIds?.length &&
      !input.policy.allowedAgentIds.includes(entry.agentId)
    ) {
      return [];
    }
    if (
      input.policy.allowedRoles?.length &&
      (!entry.role || !input.policy.allowedRoles.includes(entry.role))
    ) {
      return [];
    }
    return [{ agentId: entry.agentId, rank: agentTierRank(entry.tier) }];
  });
  if (satisfying.length === 0) return null;
  const cheapestRank = Math.min(...satisfying.map((entry) => entry.rank));
  const pick =
    satisfying.find(
      (entry) => entry.agentId === input.currentAssigneeAgentId && entry.rank === cheapestRank,
    ) ?? satisfying.find((entry) => entry.rank === cheapestRank);
  return pick?.agentId ?? null;
};

export interface BacklogIntakeAssignment {
  /** The agent the task should run under; `null` keeps the current assignee. */
  agentId: string | null;
  /**
   * Set when the task requires the builtin tool surface but the agent it
   * would run under cannot mount it — no roster pick satisfied the mount
   * gate and the kept assignee is mount-incapable (or gone). The caller
   * reports `blocked` with this reason instead of minting a dispatch that
   * can only throw at admission.
   */
  blockedReason?: string;
  /** The failed band the required tier was escalated from, if any. */
  escalatedFrom: AgentTier | null;
  required: AgentTier;
}

/**
 * Resolve which roster agent an intake-eligible backlog task should run
 * under. The decision reads only durable state — the project's roster and
 * the task's latest terminal dispatch — so it survives sweep passes and
 * restarts, and it never invents a second source of truth beside
 * `tasks.assignee_agent_id`: the returned agent is persisted as the assignee
 * before the run is requested, keeping the dispatch contract
 * (`dispatch.agent_id = task.assignee_agent_id`) intact.
 */
export const resolveBacklogIntakeAssignment = async (input: {
  candidate: TaskBacklogIntakeCandidate;
  db: OrviloDatabase;
}): Promise<BacklogIntakeAssignment> => {
  const { candidate, db } = input;
  const lastTerminal = await TaskDispatchModel.findLatestTerminalDispatch(db, {
    taskId: candidate.taskId,
    workspaceId: candidate.workspaceId,
  });
  const { escalatedFrom, required } = resolveRequiredAgentTier({
    lastTerminal,
    priority: candidate.priority,
  });
  const roster = await TaskDispatchModel.listProjectAgentRoster(db, {
    projectId: candidate.projectId,
    workspaceId: candidate.workspaceId,
  });
  const userId = candidate.userId;
  const task =
    userId && (await new TaskModel(db, userId, candidate.workspaceId).findById(candidate.taskId));
  const requiresToolSurfaceMount =
    userId && task
      ? await taskRequiresBuiltinToolMount(db, task, {
          userId,
          workspaceId: candidate.workspaceId,
        })
      : false;
  const agentId = pickTieredAgent({
    currentAssigneeAgentId: candidate.assigneeAgentId,
    policy: normalizeProjectOrchestrationPolicy(candidate.orchestrationPolicy),
    required,
    requiresToolSurfaceMount,
    roster,
  });
  let blockedReason: string | undefined;
  if (requiresToolSurfaceMount && !agentId && candidate.assigneeAgentId && userId) {
    // No roster pick satisfied the mount gate — the kept assignee is what
    // `runTask` would execute under. An assignee that is gone or
    // mount-incapable can only throw at admission, so the caller parks the
    // task instead of minting that dispatch.
    const binding = await findUsableAgentExecutionBinding(db, candidate.assigneeAgentId, {
      userId,
      workspaceId: candidate.workspaceId,
    });
    blockedReason = !binding
      ? 'assignee_agent_unusable'
      : agentCanMountBuiltinToolSurface({ agencyConfig: binding.agencyConfig }, binding.model)
        ? undefined
        : 'assignee_engine_cannot_mount_builtin_tool_surface';
  }
  return { agentId, blockedReason, escalatedFrom, required };
};
