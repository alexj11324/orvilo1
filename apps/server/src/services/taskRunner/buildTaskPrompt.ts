import { buildTaskRunPrompt, type TaskRunPromptGoalLoop } from '@orvilo/prompts';
import type {
  AutomationOccurrenceSnapshot,
  TaskDependencyReceipt,
  TaskExecutionContractContent,
  TaskItem,
  TaskTopicHandoff,
  WorkspaceData,
} from '@orvilo/types';

import { AcceptanceModel } from '@/database/models/acceptance';
import type { BriefModel } from '@/database/models/brief';
import { GoalModel } from '@/database/models/goal';
import { IssueDeliveryModel, sameIssueDeliveryProof } from '@/database/models/issueDelivery';
import type { TaskModel } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import type { TaskTopicModel } from '@/database/models/taskTopic';
import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';
import { VerifyCriterionModel } from '@/database/models/verifyCriterion';
import { VerifyRubricModel } from '@/database/models/verifyRubric';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { OrviloDatabase } from '@/database/type';
import { extractFileIdsFromEditorData } from '@/server/services/file/extractFileIdsFromEditorData';
import { resolveAttachmentMetadata } from '@/server/services/file/resolveAttachments';
import { resolveTaskAttemptBudget } from '@/server/services/goal/recoveryPolicy';
import { resolveTaskAcceptance } from '@/server/services/verify/taskAcceptance';

import { renderAutomationInput } from './automationInput';

/** Cap on unresolved checks carried into the next round's prompt. */
const MAX_GOAL_FAILED_CHECKS = 8;

/**
 * For a goal task that already ran at least one round, collect what the next
 * round must know: the previous round's unresolved checks (with the verifier's
 * why/suggestion) and the user's reject comment, both read off the task's
 * acceptance aggregate. Best-effort — any lookup failure degrades to the bare
 * round counters so prompt building never blocks a run.
 */
const resolveGoalLoopContext = async (
  task: TaskItem,
  deps: BuildTaskPromptDeps,
): Promise<TaskRunPromptGoalLoop | undefined> => {
  const { db, userId, workspaceId } = deps;
  const goal = await new GoalModel(db, userId, workspaceId).findByGraphTask(task.id);
  if (!goal || !task.totalTopics) return undefined;

  const budget = resolveTaskAttemptBudget(goal);
  const context: TaskRunPromptGoalLoop = {
    maxRounds: Number.isFinite(budget) ? budget : null,
    round: (task.totalTopics || 0) + 1,
  };

  try {
    const acceptance = await new AcceptanceModel(db, userId, workspaceId).findBySubject(
      'task',
      task.id,
    );
    if (!acceptance) return context;

    const runs = await new VerifyRunModel(db, userId, workspaceId).listByAcceptance(acceptance.id);
    const last = runs.at(-1);
    if (!last) return context;

    if (last.userDecision === 'reject') {
      const comment = (last.decisionDetail as { comment?: string } | null)?.comment;
      if (comment) context.rejectComment = comment;
    }

    const automaticReview = [...runs].reverse().find((run) => run.metadata?.goalReview)
      ?.metadata?.goalReview;
    if (automaticReview && automaticReview.status !== 'passed') {
      context.automaticReviewFeedback = automaticReview.feedback;
    }

    const plan = (last.plan ?? []) as Array<{ id: string; title: string }>;
    const results = await new VerifyCheckResultModel(db, userId, workspaceId).listByRun(last.id);
    const byItem = new Map(results.map((r) => [r.checkItemId, r]));
    const failed = plan
      .filter((item) => {
        const r = byItem.get(item.id);
        return (
          !!r &&
          r.status !== 'errored' &&
          (r.status === 'failed' || r.verdict === 'failed' || r.verdict === 'uncertain')
        );
      })
      .map((item) => {
        const r = byItem.get(item.id);
        return { title: item.title, why: r?.suggestion || r?.toulmin?.reasoning || undefined };
      });
    if (failed.length > 0) context.failedChecks = failed.slice(0, MAX_GOAL_FAILED_CHECKS);
    return context;
  } catch {
    return context;
  }
};

export interface BuildTaskPromptDeps {
  briefModel: BriefModel;
  db: OrviloDatabase;
  taskModel: TaskModel;
  taskTopicModel: TaskTopicModel;
  userId: string;
  workspaceId?: string;
}

export interface BuiltTaskPrompt {
  /** The Task carries an active Acceptance, so the builder needs the evidence
   * tool mounted for the whole run — it submits while it works. */
  acceptanceEnabled: boolean;
  /**
   * The frozen policy content this prompt was rendered from — instruction,
   * verify gate and dependency receipts. Persisted verbatim on the run
   * contract so the prompt and the contract are provably same-source.
   */
  contractContent: TaskExecutionContractContent;
  /** Merged, deduplicated list of fileIds (task instruction + all comments)
   * to forward to execAgent so files arrive as multimodal inputs. */
  fileIds: string[];
  /**
   * Goal-loop context rendered into the prompt (round + attempt budget),
   * surfaced so the run contract freezes the same budget the agent saw.
   */
  goalLoop?: TaskRunPromptGoalLoop;
  prompt: string;
}

/**
 * Server-side orchestrator: fetches task context from the DB and renders the
 * prompt that `task.run` injects into the agent runtime.
 *
 * Pure prompt rendering lives in `@orvilo/prompts` (`buildTaskRunPrompt`).
 * This wrapper is the DB-aware layer that assembles the input from models.
 */
/** Freeze the same reviewed upstream versions used by database admission. */
const collectDependencyReceipts = async (
  dependencies: Array<{ dependsOnId: string; type: string }>,
  deps: BuildTaskPromptDeps,
  depIdToIdentifier: Map<string, string>,
  depStatusById: Map<string, string>,
): Promise<TaskDependencyReceipt[]> => {
  const current = await new IssueDeliveryModel(
    deps.db,
    deps.userId,
    deps.workspaceId,
  ).readCurrentDeliveryProof(
    dependencies.filter((dep) => dep.type === 'blocks').map((dep) => dep.dependsOnId),
  );
  return dependencies.map((dep) => {
    const delivery = current[dep.dependsOnId];
    const proof = delivery?.proof;
    return {
      dependsOnId: dep.dependsOnId,
      identifier: depIdToIdentifier.get(dep.dependsOnId),
      status: depStatusById.get(dep.dependsOnId),
      type: dep.type,
      ...(dep.type === 'blocks'
        ? {
            deliveryValid: delivery?.availableForDependents === true,
            issueDelivery: proof,
            checklistRunId: delivery?.runId,
            evidenceKind: proof ? ('delivery' as const) : undefined,
            delivery: proof
              ? {
                  dispatchId: proof.dispatchId,
                  executionGeneration: proof.executionGeneration,
                  operationId: proof.deliveryOperationId,
                  sourceSha: proof.sourceSha,
                  topicId: proof.topicId,
                }
              : undefined,
          }
        : {}),
    };
  });
};

export async function buildTaskPrompt(
  task: TaskItem,
  deps: BuildTaskPromptDeps,
  extraPrompt?: string,
  opts?: {
    /**
     * Persisted contract content inherited by a continuation/repair run.
     * When present, instruction/verify/dependency policy render from the
     * contract — not the live task — so an in-place Task edit mid-run can
     * never silently rewrite an in-flight attempt's prompt.
     */
    contractContent?: TaskExecutionContractContent;
    skipTaskVerification?: boolean;
    occurrence?: AutomationOccurrenceSnapshot;
    independentOccurrence?: boolean;
  },
): Promise<BuiltTaskPrompt> {
  const { briefModel, db, taskModel, taskTopicModel, userId, workspaceId } = deps;
  const inherited = opts?.contractContent;
  const skipTaskVerification = !task.automationMode || opts?.skipTaskVerification === true;

  const [topics, briefs, comments, subtasks, liveDependencies, documents] = await Promise.all([
    !opts?.independentOccurrence && task.totalTopics && task.totalTopics > 0
      ? taskTopicModel.findWithHandoff(task.id, 4).catch(() => [])
      : Promise.resolve([]),
    briefModel.findByTaskId(task.id).catch(() => []),
    taskModel.getComments(task.id).catch(() => []),
    taskModel.findSubtasks(task.id).catch(() => []),
    // Initial dependency reads are fail-closed (SA05-A): a failed read must
    // block the claim rather than freeze an empty authoritative contract.
    taskModel.getDependencies(task.id),
    taskModel
      .getTreePinnedDocuments(task.id)
      .catch((): WorkspaceData => ({ nodeMap: {}, tree: [] })),
  ]);

  // Prompt-facing lifecycle labels derive from canonical workflow/execution
  // state — the retired `tasks.status` column is never read.
  const statusById = await taskModel.derivedStatusByIds([
    task.id,
    ...subtasks.map((s: { id: string }) => s.id),
  ]);

  // Derive fileIds from the persisted Lexical state. editor_data is the
  // single source of truth — fileId is recovered from the URL in each node
  // (proxy URL form via regex; pre-signed dev URLs via files.url lookup).
  const extractCtx = { db, userId, workspaceId };
  const [taskFileIds, ...commentFileIdLists] = await Promise.all([
    extractFileIdsFromEditorData(task.editorData, extractCtx),
    ...comments.map((c) => extractFileIdsFromEditorData(c.editorData, extractCtx)),
  ]);
  const commentFileIdsMap: Record<string, string[]> = {};
  comments.forEach((c, i) => {
    const ids = commentFileIdLists[i];
    if (ids.length > 0) commentFileIdsMap[c.id] = ids;
  });

  // Metadata-only lookup (name + fileType) for prompt rendering. Full content
  // for the agent comes via `execAgent.fileIds` → `resolveAttachmentsByFileIds`.
  // `signUrls: false` skips presigned-URL fetches we don't need for prompts.
  const allFileIds = Array.from(
    new Set([...taskFileIds, ...Object.values(commentFileIdsMap).flat()]),
  );
  const fileMetadata = await resolveAttachmentMetadata({
    db,
    fileIds: opts?.occurrence?.fileIds ?? allFileIds,
    signUrls: false,
    userId,
    workspaceId,
  });
  const fileMetaById = new Map(fileMetadata.map((f) => [f.id, f]));

  const toFileMetas = (ids: string[]) =>
    ids
      .map((id) => fileMetaById.get(id))
      .filter((f): f is (typeof fileMetadata)[number] => !!f)
      .map((f) => ({ fileType: f.fileType, id: f.id, name: f.name }));

  const subtaskIds = subtasks.map((s: any) => s.id);
  const subtaskDeps =
    subtaskIds.length > 0
      ? await taskModel.getDependenciesByTaskIds(subtaskIds).catch(() => [])
      : [];
  const subtaskIdToIdentifier = new Map(subtasks.map((s: any) => [s.id, s.identifier]));
  const subtaskDepMap = new Map<string, string>();
  for (const dep of subtaskDeps as any[]) {
    const depIdentifier = subtaskIdToIdentifier.get(dep.dependsOnId);
    if (depIdentifier) subtaskDepMap.set(dep.taskId, depIdentifier);
  }

  const depTaskIds = [...new Set(liveDependencies.map((d: any) => d.dependsOnId))];
  const depTasks = await taskModel.findByIds(depTaskIds);
  const depIdToIdentifier = new Map(depTasks.map((t: any) => [t.id, t.identifier]));
  const depStatusById = new Map(Object.entries(await taskModel.derivedStatusByIds(depTaskIds)));

  // Contract content is the policy source: an inherited contract renders its
  // frozen dependency view; a fresh run freezes what the gate just verified.
  const dependencies = inherited?.dependencies
    ? inherited.dependencies.map((receipt) => ({
        dependsOnId: receipt.dependsOnId,
        type: receipt.type,
      }))
    : liveDependencies;
  const contractDependencies =
    inherited?.dependencies ??
    (await collectDependencyReceipts(liveDependencies, deps, depIdToIdentifier, depStatusById));

  // A resumed attempt keeps its frozen receipt, but cannot start on a revoked version.
  const currentDependencies = inherited?.dependencies
    ? await new IssueDeliveryModel(db, userId, workspaceId).readCurrentDeliveryProof(
        contractDependencies
          .filter((receipt) => receipt.type === 'blocks')
          .map((receipt) => receipt.dependsOnId),
      )
    : undefined;
  const invalidDeps = contractDependencies.filter((receipt) => {
    if (receipt.type !== 'blocks') return false;
    if (!currentDependencies) return receipt.deliveryValid !== true;
    const current = currentDependencies[receipt.dependsOnId];
    return (
      !current?.availableForDependents ||
      !current.proof ||
      !receipt.issueDelivery ||
      current.runId !== receipt.checklistRunId ||
      !sameIssueDeliveryProof(current.proof, receipt.issueDelivery)
    );
  });
  if (invalidDeps.length) {
    const names = invalidDeps
      .map((receipt) => receipt.identifier ?? receipt.dependsOnId)
      .join(', ');
    throw new TaskDependencyError(
      `Dependency deliveries are not current/valid for: ${names}`,
      'PRECONDITION_FAILED',
    );
  }

  let parentIdentifier: string | null = null;
  let parentTaskContext:
    | {
        identifier: string;
        instruction: string;
        name?: string | null;
        subtasks?: Array<{
          blockedBy?: string;
          identifier: string;
          name?: string | null;
          priority?: number | null;
          status: string;
        }>;
      }
    | undefined;

  if (task.parentTaskId) {
    const parent = await taskModel.findById(task.parentTaskId);
    parentIdentifier = parent?.identifier || null;
    if (parent) {
      const siblings = await taskModel.findSubtasks(task.parentTaskId).catch(() => []);
      const siblingIds = siblings.map((s: any) => s.id);
      const siblingDeps =
        siblingIds.length > 0
          ? await taskModel.getDependenciesByTaskIds(siblingIds).catch(() => [])
          : [];
      const siblingStatusById = await taskModel.derivedStatusByIds(siblingIds);
      const siblingIdToIdentifier = new Map(siblings.map((s: any) => [s.id, s.identifier]));
      const siblingDepMap = new Map<string, string>();
      for (const dep of siblingDeps as any[]) {
        const depId = siblingIdToIdentifier.get(dep.dependsOnId);
        if (depId) siblingDepMap.set(dep.taskId, depId);
      }

      parentTaskContext = {
        identifier: parent.identifier,
        instruction: parent.instruction,
        name: parent.name,
        subtasks: siblings.map((s: any) => ({
          blockedBy: siblingDepMap.get(s.id),
          identifier: s.identifier,
          name: s.name,
          priority: s.priority,
          status: siblingStatusById[s.id] ?? 'backlog',
        })),
      };
    }
  }

  const taskFiles = toFileMetas(taskFileIds);

  // Delivery-acceptance context: resolve the Task's Acceptance policy and the
  // referenced criteria so the builder knows
  // what to self-evidence while it works. Run-time handles (verifyRunId /
  // checkItemId) don't exist yet at prompt-build time — the verify skill
  // resolves those at runtime from the builder's operationId.
  // Recurring tasks (schedule / heartbeat) never get a verify plan (see
  // instantiateVerifyPlanOnStart) — don't tell the builder to self-evidence
  // acceptance criteria whose run-time plan will never exist.
  // On an inherited contract the verify gate comes from the contract — the
  // live Acceptance row may have been edited since the attempt started, and
  // that edit must not retroactively change this run's requirements.
  const resolvedAcceptance =
    inherited || task.automationMode || skipTaskVerification
      ? undefined
      : await resolveTaskAcceptance(db, userId, task.id, workspaceId).catch(() => undefined);
  const verifyConfig = resolvedAcceptance?.config;
  const verifyEnabled =
    !skipTaskVerification &&
    (inherited
      ? (inherited.verify?.enabled ?? false)
      : !!resolvedAcceptance && verifyConfig?.enabled !== false);
  let verifyCriteria: Array<{
    required?: boolean;
    requiredEvidence?: Array<{ hint?: string; type: string }>;
    title: string;
  }> = inherited?.verify?.criteria ?? [];
  if (
    verifyEnabled &&
    verifyConfig &&
    (verifyConfig.verifyRubricId || verifyConfig.verifyCriteriaIds?.length)
  ) {
    const criterionModel = new VerifyCriterionModel(db, userId, workspaceId);
    const rubricModel = new VerifyRubricModel(db, userId, workspaceId);
    const collected = (
      await Promise.all([
        verifyConfig.verifyRubricId
          ? rubricModel.getCriteria(verifyConfig.verifyRubricId).catch(() => [])
          : Promise.resolve([]),
        verifyConfig.verifyCriteriaIds?.length
          ? criterionModel.findByIds(verifyConfig.verifyCriteriaIds).catch(() => [])
          : Promise.resolve([]),
      ])
    ).flat();
    const seen = new Set<string>();
    verifyCriteria = collected
      .filter((c) => !seen.has(c.id) && seen.add(c.id))
      .map((c) => {
        const raw = (c.verifierConfig as Record<string, unknown> | null)?.requiredEvidence;
        return {
          required: c.required,
          requiredEvidence: Array.isArray(raw)
            ? (raw as Array<{ hint?: string; type: string }>)
            : undefined,
          title: c.title,
        };
      });
  }

  const goalLoop = skipTaskVerification ? undefined : await resolveGoalLoopContext(task, deps);

  const prompt = buildTaskRunPrompt({
    ...(goalLoop ? { goalLoop } : {}),
    activities: {
      briefs: briefs.map((b: any) => ({
        createdAt: b.createdAt,
        id: b.id,
        priority: b.priority,
        resolvedAction: b.resolvedAction,
        resolvedAt: b.resolvedAt,
        resolvedComment: b.resolvedComment,
        summary: b.summary,
        title: b.title,
        type: b.type,
      })),
      comments: comments.map((c: any) => {
        const files = toFileMetas(commentFileIdsMap[c.id] ?? []);
        return {
          agentId: c.authorAgentId,
          content: c.content,
          createdAt: c.createdAt,
          ...(files.length > 0 ? { files } : {}),
          id: c.id,
        };
      }),
      subtasks: subtasks.map((s: any) => ({
        createdAt: s.createdAt,
        id: s.id,
        identifier: s.identifier,
        name: s.name,
        status: statusById[s.id] ?? 'backlog',
      })),
      topics: (topics as any[]).map((t) => {
        const handoff = t.handoff as TaskTopicHandoff | null;
        return {
          createdAt: t.createdAt,
          handoff,
          id: t.topicId || t.id,
          seq: t.seq,
          status: t.status,
          title: handoff?.title || t.title,
        };
      }),
    },
    extraPrompt:
      [
        extraPrompt,
        renderAutomationInput(opts?.occurrence),
        contractDependencies
          .filter((receipt) => receipt.issueDelivery)
          .map(
            (receipt) =>
              `Prerequisite ${receipt.identifier ?? receipt.dependsOnId}: ${JSON.stringify({ proof: receipt.issueDelivery, checklistRunId: receipt.checklistRunId })}. Use this exact reviewed version. For code in the same repository, fetch its branch and merge this source SHA into your task branch before implementation; keep the PR stacked on the provisioned upstream base branch.`,
          )
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n') || undefined,
    parentTask: parentTaskContext,
    task: {
      assigneeAgentId: task.assigneeAgentId,
      automationMode: task.automationMode,
      dependencies: dependencies.map((d: any) => ({
        dependsOn:
          depIdToIdentifier.get(d.dependsOnId) ??
          contractDependencies.find((receipt) => receipt.dependsOnId === d.dependsOnId)
            ?.identifier ??
          'Unavailable prerequisite',
        type: d.type,
      })),
      description: task.description,
      ...(taskFiles.length > 0 ? { files: taskFiles } : {}),
      heartbeatInterval: task.heartbeatInterval,
      id: task.id,
      identifier: task.identifier,
      instruction: inherited?.instruction ?? task.instruction,
      name: task.name,
      parentIdentifier,
      priority: task.priority,
      review: taskModel.getReviewConfig(task) as any,
      schedulePattern: task.schedulePattern,
      scheduleTimezone: task.scheduleTimezone,
      status: statusById[task.id] ?? 'backlog',
      verify: verifyEnabled
        ? {
            criteria: verifyCriteria,
            enabled: true,
            maxIterations: inherited?.verify?.maxIterations ?? verifyConfig?.maxIterations,
            requirement: inherited?.verify?.requirement ?? resolvedAcceptance?.requirement,
          }
        : undefined,
      subtasks: subtasks.map((s: any) => ({
        blockedBy: subtaskDepMap.get(s.id),
        identifier: s.identifier,
        name: s.name,
        priority: s.priority,
        status: s.status,
      })),
    },
    workspace: documents.tree.map((rootNode) => {
      const rootDoc = documents.nodeMap[rootNode.id];
      return {
        children: rootNode.children.map((child) => {
          const childDoc = documents.nodeMap[child.id];
          return {
            createdAt: childDoc?.createdAt,
            documentId: child.id,
            size: childDoc?.charCount ?? undefined,
            sourceTaskIdentifier: childDoc?.sourceTaskIdentifier ?? undefined,
            title: childDoc?.title,
          };
        }),
        createdAt: rootDoc?.createdAt,
        documentId: rootNode.id,
        title: rootDoc?.title,
      };
    }),
  });

  const contractContent: TaskExecutionContractContent = inherited
    ? { ...inherited, ...(skipTaskVerification ? { verify: { enabled: false } } : {}) }
    : {
        dependencies: contractDependencies,
        instruction: task.instruction,
        verify: verifyEnabled
          ? {
              criteria: verifyCriteria,
              enabled: true,
              maxIterations: verifyConfig?.maxIterations,
              requirement: resolvedAcceptance?.requirement,
            }
          : { enabled: false },
      };

  return {
    acceptanceEnabled: verifyEnabled,
    contractContent,
    fileIds: opts?.occurrence?.fileIds ?? allFileIds,
    ...(goalLoop ? { goalLoop } : {}),
    prompt,
  };
}
