import type { TaskContext, TaskItem } from '@orvilo/types';

import { IssueDeliveryModel } from '@/database/models/issueDelivery';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';

/** Membership belongs to the confirmed plan, never the descendant tree. */
export const confirmedDeliveryMemberIds = (task: TaskItem): string[] => {
  const plan = (task.context as TaskContext | null)?.issuePlan;
  if (!plan?.confirmedAt || !plan.checklists.some((check) => check.taskId === task.id)) return [];
  const ids = [...new Set(plan.checklists.map((check) => check.taskId))];
  return ids.includes(plan.parentTaskId) ? ids.sort() : [];
};

export const readDeliveryGroup = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  task: TaskItem,
) => {
  const model = new TaskModel(db, userId, workspaceId);
  const ids = confirmedDeliveryMemberIds(task);
  const plan = (task.context as TaskContext | null)?.issuePlan;
  const members = await new IssueDeliveryModel(db, userId, workspaceId).readableTasks(ids);
  const parent = members.find((member) => member.id === plan?.parentTaskId);
  const parentPlan = (parent?.context as TaskContext | null)?.issuePlan;
  const dependencies = ids.length ? await model.getDependenciesByTaskIds(ids) : [];
  const valid =
    ids.length > 0 &&
    members.length === ids.length &&
    parentPlan?.confirmedAt === plan?.confirmedAt &&
    parentPlan?.revision === plan?.revision &&
    JSON.stringify(parent && confirmedDeliveryMemberIds(parent)) === JSON.stringify(ids) &&
    members.every((member) => {
      const memberPlan = (member.context as TaskContext | null)?.issuePlan;
      return (
        memberPlan?.confirmedAt === plan?.confirmedAt &&
        memberPlan?.revision === plan?.revision &&
        JSON.stringify(confirmedDeliveryMemberIds(member)) === JSON.stringify(ids)
      );
    }) &&
    (ids.length === 1 ||
      (plan?.checklists.find((check) => check.taskId === parent?.id)?.deliveryKind === 'artifact' &&
        ids
          .filter((id) => id !== parent?.id)
          .every((id) =>
            dependencies.some(
              (edge) =>
                edge.type === 'blocks' && edge.taskId === parent?.id && edge.dependsOnId === id,
            ),
          )));
  const externalIds = [
    ...new Set(
      dependencies.filter((edge) => edge.type === 'blocks').map((edge) => edge.dependsOnId),
    ),
  ].filter((id) => !ids.includes(id));
  const externalMembers = valid
    ? await new IssueDeliveryModel(db, userId, workspaceId).readableTasks(externalIds)
    : [];
  const proofs = valid
    ? await new IssueDeliveryModel(db, userId, workspaceId).readCurrentDeliveryProof([
        ...ids,
        ...externalIds,
      ])
    : {};
  const inConfirmedScope = (id: string) => {
    const check = plan?.checklists.find((check) => check.taskId === id);
    const proof = proofs[id]?.proof;
    return Boolean(
      check &&
      proof &&
      proof.deliveryKind === check.deliveryKind &&
      proof.checklistRevision === check.expectedRevision + 1 &&
      (check.deliveryKind === 'artifact' ||
        (proof.repo === check.repo && proof.targetBranch === check.targetBranch)),
    );
  };
  const accepted =
    valid &&
    ids.every((id) => {
      const current = proofs[id];
      return (
        inConfirmedScope(id) &&
        current?.reviewerPassed &&
        current.necessaryChecksPassed &&
        current.itemsAccepted &&
        current.deliveryAccepted
      );
    });
  const delivered = (id: string, visited: string[] = []): boolean => {
    const current = proofs[id];
    if (!current?.deliveryAccepted || visited.includes(id)) return false;
    if (current.proof?.deliveryKind === 'code') return current.merged;
    if (!ids.includes(id))
      return externalMembers.some(
        (member) => member.id === id && member.workflowCategory === 'done',
      );
    return dependencies
      .filter((edge) => edge.type === 'blocks' && edge.taskId === id)
      .every((edge) => delivered(edge.dependsOnId, [...visited, id]));
  };
  return {
    accepted,
    dependencies,
    delivered,
    ids,
    inConfirmedScope,
    members,
    parent,
    proofs,
    valid,
  };
};

export const finishDeliveredIssue = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  task: TaskItem,
) => {
  const current = (await readDeliveryGroup(db, userId, workspaceId, task)).proofs[task.id];
  const dispatch = current?.proof?.dispatchId
    ? await new TaskDispatchModel(db, workspaceId).findById(current.proof.dispatchId)
    : undefined;
  if (
    task.automationMode ||
    (dispatch?.automationOccurrence && !dispatch.automationOccurrence.parentDispatchId)
  ) {
    if (!current?.proof) throw new Error('Current automation delivery proof is missing');
    const { completeAutomationDelivery } = await import('../taskAutomationQueue');
    await completeAutomationDelivery(db, userId, workspaceId, current.proof);
  } else if (task.workflowCategory !== 'done') {
    const { TaskService } = await import('./index');
    await new TaskService(db, userId, workspaceId).updateStatus({
      id: task.id,
      status: 'completed',
    });
  }
};

/** Called after final acceptance and every merge; parent report waits for all real deliveries. */
export const completeAcceptedArtifacts = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  taskId: string,
) => {
  const task = await new TaskModel(db, userId, workspaceId).findById(taskId);
  if (!task) return;
  const group = await readDeliveryGroup(db, userId, workspaceId, task);
  if (!group.accepted) return;
  for (const member of group.members) {
    if (group.proofs[member.id]?.proof?.deliveryKind !== 'artifact') continue;
    if (
      group.dependencies.some(
        (edge) =>
          edge.type === 'blocks' && edge.taskId === member.id && !group.delivered(edge.dependsOnId),
      )
    )
      continue;
    if (member.id === group.parent?.id && !group.ids.every((id) => group.delivered(id))) continue;
    await finishDeliveredIssue(db, userId, workspaceId, member);
  }
};
