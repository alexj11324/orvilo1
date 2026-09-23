import type {
  ProjectDatePrecision,
  ProjectHealth,
  ProjectOrchestrationPolicy,
  ProjectPriority,
  ProjectStatus,
  ProjectUpdateKind,
  ProjectVisibility,
} from '@orvilo/types';

import { createWorkspaceLambdaClient, lambdaClient } from '@/libs/trpc/client';

const PROJECT_PAGE_SIZE = 100;

class ProjectService {
  listLinks = async (id: string) => lambdaClient.project.listLinks.query({ id });
  saveLink = async (id: string, input: { linkId?: string; title?: string; url: string }) =>
    lambdaClient.project.saveLink.mutate({ id, ...input });
  removeLink = async (id: string, linkId: string) =>
    lambdaClient.project.removeLink.mutate({ id, linkId });
  labels = async () => lambdaClient.project.labels.query();
  teams = async () => lambdaClient.team.teams.query();
  activityFeed = async (id: string, limit = 50, cursor?: string | null) =>
    lambdaClient.project.activityFeed.query({ cursor, id, limit });

  acceptCompletion = async (id: string, comment?: string) =>
    lambdaClient.project.acceptCompletion.mutate({ comment, id });

  /**
   * Bind a knowledge base to a project. The server treats this as a reference:
   * it validates that the caller may manage the project *and* can see the
   * knowledge base, then upserts the `project_knowledge_bases` row — so adding
   * an already-bound library is idempotent rather than an error.
   */
  addKnowledgeBase = async (id: string, knowledgeBaseId: string) =>
    lambdaClient.project.addKnowledgeBase.mutate({ id, knowledgeBaseId });

  listAll = async (params: { statuses?: ProjectStatus[] } = {}) => {
    const projects = [];
    let offset = 0;
    let response;

    do {
      response = await lambdaClient.project.list.query({
        limit: PROJECT_PAGE_SIZE,
        offset,
        ...params,
      });
      projects.push(...response.data);
      offset += response.data.length;
    } while (response.data.length === PROJECT_PAGE_SIZE);

    return { ...response, data: projects };
  };

  detail = async (id: string) => lambdaClient.project.detail.query({ id });

  listUpdates = async (id: string) => lambdaClient.project.listUpdates.query({ id });

  createUpdate = async (
    id: string,
    input: { body: string; health?: ProjectHealth; kind?: ProjectUpdateKind },
  ) => lambdaClient.project.createUpdate.mutate({ id, ...input });

  createMilestone = async (
    id: string,
    input: { date?: string | null; description?: string | null; name: string; sortOrder?: number },
  ) => lambdaClient.project.createMilestone.mutate({ id, ...input });

  updateMilestone = async (
    id: string,
    milestoneId: string,
    input: { date?: string | null; description?: string | null; name?: string },
  ) => lambdaClient.project.updateMilestone.mutate({ id, milestoneId, ...input });

  deleteMilestone = async (id: string, milestoneId: string) =>
    lambdaClient.project.deleteMilestone.mutate({ id, milestoneId });

  reorderMilestones = async (id: string, milestoneIds: string[]) =>
    lambdaClient.project.reorderMilestones.mutate({ id, milestoneIds });

  setTaskMilestone = async (id: string, taskId: string, milestoneId: string | null) =>
    lambdaClient.project.setTaskMilestone.mutate({ id, milestoneId, taskId });

  getOrchestrationPolicy = async (id: string) =>
    lambdaClient.project.getOrchestrationPolicy.query({ id });

  delete = async (id: string) => lambdaClient.project.delete.mutate({ id });

  create = async (
    params: {
      dependencies?: { projectId: string; type: 'blockedBy' | 'blocking' }[];
      labelIds?: string[];
      memberIds?: string[];
      milestones?: { name: string; description?: string; date?: string }[];
      newLabelNames?: string[];
      priority?: ProjectPriority;
      startDatePrecision?: ProjectDatePrecision;
      targetDatePrecision?: ProjectDatePrecision;
      status?: 'backlog' | 'planned' | 'active' | 'paused' | 'canceled' | 'archived';
      avatar?: string;
      description?: string;
      identifier: string;
      name: string;
      summary?: string;
      leadUserId?: string;
      startDate?: string;
      targetDate?: string;
      teamId?: string;
      slug?: string;
      visibility?: ProjectVisibility;
    },
    workspaceId?: string | null,
  ) =>
    (workspaceId ? createWorkspaceLambdaClient(workspaceId) : lambdaClient).project.create.mutate(
      params,
    );

  rejectCompletion = async (id: string, comment: string) =>
    lambdaClient.project.rejectCompletion.mutate({ comment, id });

  /**
   * Drop a project's reference to a knowledge base. This deletes the binding
   * row only — the library, its files and any other project's reference to it
   * are untouched, which is why the UI asks for confirmation in those terms.
   */
  removeKnowledgeBase = async (id: string, knowledgeBaseId: string) =>
    lambdaClient.project.removeKnowledgeBase.mutate({ id, knowledgeBaseId });

  reopen = async (id: string) => lambdaClient.project.reopen.mutate({ id });

  requestCompletion = async (id: string) => lambdaClient.project.requestCompletion.mutate({ id });

  update = async (
    id: string,
    input: {
      description?: string;
      labelIds?: string[];
      leadUserId?: string | null;
      name?: string;
      summary?: string;
      priority?: ProjectPriority;
      startDate?: string | null;
      startDatePrecision?: ProjectDatePrecision | null;
      targetDate?: string | null;
      targetDatePrecision?: ProjectDatePrecision | null;
    },
  ) => lambdaClient.project.update.mutate({ id, ...input });

  updateOrchestrationPolicy = async (
    id: string,
    input: {
      coordinatorAgentId: string;
      expectedRevision: number;
      orchestrationPolicy: ProjectOrchestrationPolicy;
    },
  ) => lambdaClient.project.updateOrchestrationPolicy.mutate({ id, ...input });

  updateStatus = async (
    id: string,
    status: 'active' | 'archived' | 'backlog' | 'canceled' | 'paused' | 'planned',
  ) => lambdaClient.project.updateStatus.mutate({ id, status });
}

export const projectService = new ProjectService();
