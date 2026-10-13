import { buildTaskRunPrompt } from '@orvilo/prompts';
import type {
  AutomationOccurrenceSnapshot,
  TaskDependencyReceipt,
  TaskExecutionContractContent,
  TaskItem,
  TaskTopicHandoff,
  WorkspaceData,
} from '@orvilo/types';

import type { BriefModel } from '@/database/models/brief';
import type { TaskModel } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import type { TaskTopicModel } from '@/database/models/taskTopic';
import type { OrviloDatabase } from '@/database/type';
import { extractFileIdsFromEditorData } from '@/server/services/file/extractFileIdsFromEditorData';
import { resolveAttachmentMetadata } from '@/server/services/file/resolveAttachments';

import { renderAutomationInput } from './automationInput';

export interface BuildTaskPromptDeps {
  briefModel: BriefModel;
  db: OrviloDatabase;
  taskModel: TaskModel;
  taskTopicModel: TaskTopicModel;
  userId: string;
  workspaceId?: string;
}

export interface BuiltTaskPrompt {
  /**
   * The frozen policy content this prompt was rendered from — instruction,
   * dependency receipts. Persisted verbatim on the run
   * contract so the prompt and the contract are provably same-source.
   */
  contractContent: TaskExecutionContractContent;
  /** Merged, deduplicated list of fileIds (task instruction + all comments)
   * to forward to execAgent so files arrive as multimodal inputs. */
  fileIds: string[];
  prompt: string;
}

/**
 * Server-side orchestrator: fetches task context from the DB and renders the
 * prompt that `task.run` injects into the agent runtime.
 *
 * Pure prompt rendering lives in `@orvilo/prompts` (`buildTaskRunPrompt`).
 * This wrapper is the DB-aware layer that assembles the input from models.
 */
/**
 * The delivery a `blocks` dependency's prompt line rests on: the upstream
 * task's latest completed run topic, with the immutable SHAs it recorded.
 * Absent delivery means the gate that admitted this run did not observe a
 * settled upstream delivery — the receipt still records the upstream status.
 */
const collectDependencyReceipts = async (
  dependencies: Array<{ dependsOnId: string; type: string }>,
  deps: BuildTaskPromptDeps,
  depIdToIdentifier: Map<string, string>,
  depStatusById: Map<string, string>,
  depGenerationById: Map<string, number | undefined>,
): Promise<TaskDependencyReceipt[]> => {
  const receipts: TaskDependencyReceipt[] = [];
  for (const dep of dependencies) {
    const receipt: TaskDependencyReceipt = {
      dependsOnId: dep.dependsOnId,
      identifier: depIdToIdentifier.get(dep.dependsOnId),
      status: depStatusById.get(dep.dependsOnId),
      type: dep.type,
    };
    if (dep.type !== 'blocks') {
      receipts.push(receipt);
      continue;
    }
    // Read failures must propagate — degrading to "no delivery observed" would
    // let a claim freeze receipts that never saw the upstream's real state.
    const topics = await deps.taskTopicModel.findByTaskId(dep.dependsOnId);
    // The receipt's delivery is the upstream's LATEST completed attempt — not
    // the first completed row in history, which would let a fresh failing
    // attempt ride on a delivery the current generation no longer stands on.
    const delivered = [...topics]
      .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
      .find((topic) => topic.status === 'completed' && topic.topicId);
    if (delivered?.topicId) {
      receipt.delivery = {
        dispatchId: delivered.dispatchId ?? undefined,
        executionGeneration: delivered.executionGeneration ?? undefined,
        integratedSha: delivered.integration?.integratedSha,
        operationId: delivered.operationId ?? undefined,
        seq: delivered.seq ?? undefined,
        sourceSha: delivered.integration?.expectedHeadSha,
        topicId: delivered.topicId,
      };
    }
    // A human-completed upstream is a valid admission but a different evidence
    // class than an agent-produced delivery receipt — record which kind this
    // `deliveryValid` decision rests on, never fabricate a delivery.
    receipt.evidenceKind = delivered?.topicId
      ? 'delivery'
      : depStatusById.get(dep.dependsOnId) === 'completed'
        ? 'manual_completion'
        : undefined;
    // Valid only while the upstream is still standing on that delivery. An
    // upstream completed with no recorded attempt (a manual status flip) is
    // itself the delivery — the receipt honestly records `delivery` absent —
    // but an in-flight attempt alongside a 'completed' status is
    // contradictory and still refuses. When a completed attempt does exist it
    // must bind the current upstream identity: no dispatch identity, a
    // superseded execution generation, or a revoked/non-landed integration
    // record invalidates the receipt even though the row exists.
    receipt.deliveryValid =
      depStatusById.get(dep.dependsOnId) === 'completed' &&
      (delivered === undefined
        ? !topics.some((topic) => topic.status === 'running')
        : delivered.dispatchId != null &&
          delivered.executionGeneration === depGenerationById.get(dep.dependsOnId) &&
          (delivered.integration == null || delivered.integration.state === 'integrated'));
    receipts.push(receipt);
  }
  return receipts;
};

export async function buildTaskPrompt(
  task: TaskItem,
  deps: BuildTaskPromptDeps,
  extraPrompt?: string,
  opts?: {
    /**
     * Persisted contract content inherited by a continuation/repair run.
     * When present, instruction/dependency policy render from the
     * contract — not the live task — so an in-place Task edit mid-run can
     * never silently rewrite an in-flight attempt's prompt.
     */
    contractContent?: TaskExecutionContractContent;
    occurrence?: AutomationOccurrenceSnapshot;
    independentOccurrence?: boolean;
  },
): Promise<BuiltTaskPrompt> {
  const { briefModel, db, taskModel, taskTopicModel, userId, workspaceId } = deps;
  const inherited = opts?.contractContent;

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
  const depGenerationById = new Map(
    depTasks.map((t: any) => [t.id, t.executionGeneration as number | undefined]),
  );

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
    (await collectDependencyReceipts(
      liveDependencies,
      deps,
      depIdToIdentifier,
      depStatusById,
      depGenerationById,
    ));

  // Claim-side dependency gate (fresh attempts only — a continuation executes
  // the frozen contract verbatim): a `blocks` receipt that is not the
  // upstream's current valid delivery refuses the claim instead of freezing
  // a receipt built on a superseded or revoked delivery.
  if (!inherited) {
    const invalidDeps = contractDependencies.filter(
      (receipt) => receipt.type === 'blocks' && receipt.deliveryValid === false,
    );
    if (invalidDeps.length > 0) {
      const names = invalidDeps
        .map((receipt) => receipt.identifier ?? receipt.dependsOnId)
        .join(', ');
      throw new TaskDependencyError(
        `Dependency deliveries are not current/valid for: ${names}`,
        'PRECONDITION_FAILED',
      );
    }
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

  const prompt = buildTaskRunPrompt({
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
      [extraPrompt, renderAutomationInput(opts?.occurrence)].filter(Boolean).join('\n\n') ||
      undefined,
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
      schedulePattern: task.schedulePattern,
      scheduleTimezone: task.scheduleTimezone,
      status: statusById[task.id] ?? 'backlog',
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

  const contractContent: TaskExecutionContractContent = inherited ?? {
    dependencies: contractDependencies,
    instruction: task.instruction,
  };

  return {
    contractContent,
    fileIds: opts?.occurrence?.fileIds ?? allFileIds,
    prompt,
  };
}
