/**
 * Seed the volume half of the synthetic Linear parity fixture: extra teams,
 * projects with full planning fields, and enough tasks/approvals/views that
 * Timeline, boards, filters, Reviews and Inbox all render populated states.
 *
 * The base fixture (`seedLinearParity` in packages/database) keeps its exact
 * guardrails — this module only ever adds rows under its own deterministic
 * ids, slugs, keys and dedupe prefixes, so re-running either script is safe.
 *
 * Run standalone from the repository root:
 *   ORVILO_PARITY_SEED_TARGET=local bun scripts/seedLinearParity/seedParityVolume.ts
 *
 * `workflow:seed-linear-parity` (index.ts) invokes it after the base seed.
 */
import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { and, asc, eq, inArray, like } from 'drizzle-orm';

import type { LinearParitySeedResult } from '../../packages/database/src/fixtures/linearParitySeed';
import type { OrviloDatabase } from '../../packages/database/src/type';
import type { VolumeTaskSpec } from './seedParityVolume.data';
import {
  daysAgo,
  FIXTURE_DEDUPE_PREFIX,
  NOW,
  VOLUME_ACTIVITIES,
  VOLUME_APPROVALS,
  VOLUME_COMMENTS,
  VOLUME_CYCLE,
  VOLUME_FAVORITES,
  VOLUME_NOTIFICATIONS,
  VOLUME_PROJECTS,
  VOLUME_SAVED_VIEWS,
  VOLUME_SUBSCRIBED_TASK_IDS,
  VOLUME_TASK_EDGES,
  VOLUME_TASKS,
  VOLUME_TEAM,
  VOLUME_WORKFLOW_REMOTE_PREFIX,
  volUuid,
} from './seedParityVolume.data';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

const LOCAL_PARITY_DATABASE = {
  database: 'orvilo_linear_parity_20260922',
  hostname: 'localhost',
  port: '5432',
} as const;

export const assertLocalParityDatabase = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  const database = url.pathname.replace(/^\//, '');
  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    url.hostname !== LOCAL_PARITY_DATABASE.hostname ||
    url.port !== LOCAL_PARITY_DATABASE.port ||
    database !== LOCAL_PARITY_DATABASE.database
  ) {
    throw new Error(
      `Refusing to seed parity volume outside ${LOCAL_PARITY_DATABASE.hostname}:${LOCAL_PARITY_DATABASE.port}/${LOCAL_PARITY_DATABASE.database}`,
    );
  }
};

const closeDatabase = async (database: { $client?: { end?: () => Promise<void> } }) => {
  if (database.$client?.end) await database.$client.end();
};

const CREATED_BY_SNAPSHOT = { displayName: 'Agent Testing User', kind: 'user' as const };

/* ── Seed implementation ───────────────────────────────────────────────── */

export interface LinearParityVolumeContext {
  /** Base fixture result — the PTP project and PARITY team anchor the graph. */
  base: LinearParitySeedResult;
  userId: string;
  workspaceId: string;
}

export interface LinearParityVolumeResult {
  approvalIds: string[];
  commentIds: string[];
  favoriteIds: string[];
  milestoneIds: string[];
  notificationIds: string[];
  projectIds: string[];
  savedViewIds: string[];
  subscriptionIds: string[];
  taskIds: string[];
  teamIds: string[];
}

const stateByCategory = (states: TeamWorkflowStateItem[], category: TaskWorkflowCategory) => {
  const state = states.find((item) => item.category === category);
  if (!state) throw new Error(`Missing workflow state for category: ${category}`);
  return state;
};

const taskRow = (
  spec: VolumeTaskSpec,
  ctx: {
    cycleId?: string;
    milestoneId?: string | null;
    state: TeamWorkflowStateItem;
    teamId: string;
    userId: string;
    workspaceId: string;
  },
) => ({
  assigneeUserId: spec.assignee ? ctx.userId : null,
  completedAt:
    spec.status === 'completed' || spec.status === 'canceled' ? daysAgo(spec.daysOld) : null,
  createdAt: daysAgo(spec.daysOld),
  createdBySnapshot: CREATED_BY_SNAPSHOT,
  createdBySubjectId: ctx.userId,
  createdBySubjectKind: 'user' as const,
  createdByUserId: ctx.userId,
  cycleRefId: spec.cycle ? (ctx.cycleId ?? null) : null,
  description: spec.description ?? null,
  error: spec.error ?? null,
  id: spec.id,
  identifier: spec.identifier,
  instruction: `Synthetic Linear-parity volume task ${spec.identifier}.`,
  name: spec.name,
  parentTaskId: spec.parentId ?? null,
  priority: spec.priority ?? 0,
  projectId: spec.projectSlug ? ctxProjectId(spec.projectSlug) : null,
  projectMilestoneId: ctx.milestoneId ?? null,
  reviewerUserId: spec.review ? ctx.userId : null,
  seq: Number(spec.identifier.split('-').at(-1)),
  startedAt:
    spec.status === 'running' ||
    spec.status === 'paused' ||
    spec.status === 'completed' ||
    spec.status === 'failed'
      ? daysAgo(spec.daysOld)
      : null,
  status: spec.status,
  teamId: ctx.teamId,
  triageStatus: spec.untriaged ? ('untriaged' as const) : ('accepted' as const),
  updatedAt: daysAgo(Math.max(0, spec.daysOld - 1)),
  visibility: 'public' as const,
  workflowCategory: spec.category,
  workflowStateId: ctx.state.remoteStateId,
  workflowStateRefId: ctx.state.id,
  workspaceId: ctx.workspaceId,
});

// Filled per-run; keeps `taskRow` a pure spec→row mapping.
const projectIdBySlug = new Map<string, string>();
const ctxProjectId = (slug: string) => {
  const id = projectIdBySlug.get(slug);
  if (!id) throw new Error(`Volume task references unknown project slug: ${slug}`);
  return id;
};

export const seedLinearParityVolume = async (
  db: OrviloDatabase,
  ctx: LinearParityVolumeContext,
): Promise<LinearParityVolumeResult> => {
  const [
    { ProjectModel },
    { ProjectMemberModel },
    { TeamModel },
    { NotificationModel },
    { actionApprovals },
    { notifications },
    { navigationFavorites, savedViews, taskSubscriptions },
    { projectDependencies, projectLabelBindings, projectLabels, projectMilestones, projects },
    { projectLinks },
    { projectUpdates },
    { taskActivities, taskComments, taskDependencies, tasks },
    { teamWorkflowStates },
  ] = await Promise.all([
    import('../../packages/database/src/models/project'),
    import('../../packages/database/src/models/projectMember'),
    import('../../packages/database/src/models/team'),
    import('../../packages/database/src/models/notification'),
    import('../../packages/database/src/schemas/actionApproval'),
    import('../../packages/database/src/schemas/notification'),
    import('../../packages/database/src/schemas/workAttention'),
    import('../../packages/database/src/schemas/project'),
    import('../../packages/database/src/schemas/projectLink'),
    import('../../packages/database/src/schemas/projectUpdate'),
    import('../../packages/database/src/schemas/task'),
    import('../../packages/database/src/schemas/team'),
  ]);

  const { base, userId, workspaceId } = ctx;
  const teamModel = new TeamModel(db, userId, workspaceId);
  const projectModel = new ProjectModel(db, userId, workspaceId);
  const memberModel = new ProjectMemberModel(db, userId);

  /* ── Second team + its workflow states ── */
  let ship = await teamModel.findByKey(VOLUME_TEAM.key);
  if (ship) {
    if (ship.name !== VOLUME_TEAM.name || ship.createdByUserId !== userId) {
      throw new Error('A non-fixture team already occupies the volume team key');
    }
  } else {
    ship = await teamModel.create({
      isDefault: false,
      key: VOLUME_TEAM.key,
      name: VOLUME_TEAM.name,
      visibility: 'public',
    });
  }
  await teamModel.addMember(ship.id, userId, 'lead');

  const parityStates = await db
    .select()
    .from(teamWorkflowStates)
    .where(eq(teamWorkflowStates.teamId, base.teamId))
    .orderBy(asc(teamWorkflowStates.position));
  const shipStates: TeamWorkflowStateItem[] = [];
  for (const [position, state] of (
    [
      ['triage', 'Triage'],
      ['backlog', 'Backlog'],
      ['todo', 'Todo'],
      ['in_progress', 'In Progress'],
      ['in_review', 'In Review'],
      ['done', 'Done'],
      ['canceled', 'Canceled'],
    ] as const
  ).entries()) {
    shipStates.push(
      await teamModel.upsertWorkflowStateByRemoteId({
        category: state[0],
        color: null,
        name: state[1],
        position,
        remoteStateId: `${VOLUME_WORKFLOW_REMOTE_PREFIX}${state[0]}`,
        teamId: ship.id,
      }),
    );
  }
  const statesByTeam = new Map([
    ['PARITY' as const, parityStates],
    ['SHIP' as const, shipStates],
  ]);
  const teamIdByKey = new Map([
    ['PARITY' as const, base.teamId],
    ['SHIP' as const, ship.id],
  ]);

  const cycle = await teamModel.upsertCycleByRemoteId({
    endsAt: VOLUME_CYCLE.endsAt,
    name: VOLUME_CYCLE.name,
    number: VOLUME_CYCLE.number,
    remoteCycleId: VOLUME_CYCLE.remoteCycleId,
    startsAt: VOLUME_CYCLE.startsAt,
    teamId: base.teamId,
  });

  /* ── Projects: create-or-repair by slug ── */
  projectIdBySlug.clear();
  projectIdBySlug.set('parity-test-project', base.projectId);
  const projectIds: string[] = [];
  const milestoneIds: string[] = [];

  for (const spec of VOLUME_PROJECTS) {
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, spec.slug)))
      .limit(1);

    let projectId: string;
    if (existing) {
      if (
        existing.userId !== userId ||
        existing.identifier !== spec.identifier ||
        existing.name !== spec.name
      ) {
        throw new Error(`A non-fixture project already occupies the slug: ${spec.slug}`);
      }
      await db
        .update(projects)
        .set({
          description: spec.description,
          health: spec.health ?? null,
          leadUserId: userId,
          priority: spec.priority,
          startDate: spec.startDate,
          startDatePrecision: 'day',
          status: spec.status,
          summary: spec.summary,
          targetDate: spec.targetDate,
          targetDatePrecision: 'day',
          visibility: 'public',
        })
        .where(eq(projects.id, existing.id));
      projectId = existing.id;
    } else {
      const [identifierCollision] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.identifier, spec.identifier)))
        .limit(1);
      if (identifierCollision) {
        throw new Error(`A non-fixture project occupies the identifier: ${spec.identifier}`);
      }
      const project = await projectModel.create({
        dependencies: spec.dependencies
          .map((dep) => ({ projectId: projectIdBySlug.get(dep.slug) ?? '', type: dep.type }))
          .filter((dep) => dep.projectId),
        description: spec.description,
        identifier: spec.identifier,
        leadUserId: userId,
        memberIds: [userId],
        milestones: spec.milestones,
        name: spec.name,
        newLabelNames: spec.labels,
        priority: spec.priority,
        slug: spec.slug,
        startDate: spec.startDate,
        startDatePrecision: 'day',
        status: spec.status,
        summary: spec.summary,
        targetDate: spec.targetDate,
        targetDatePrecision: 'day',
        teamId: teamIdByKey.get(spec.teamKey),
        visibility: 'public',
      });
      projectId = project.id;
      if (spec.health) {
        await db.update(projects).set({ health: spec.health }).where(eq(projects.id, projectId));
      }
    }
    projectIdBySlug.set(spec.slug, projectId);
    projectIds.push(projectId);

    await memberModel.add({ projectId, role: 'manager', userId, workspaceId });
    await teamModel.linkProject(projectId, teamIdByKey.get(spec.teamKey)!);

    // Milestones — upsert by (projectId, name): `name` is NOT NULL since
    // migration 0189; sortOrder pins the canonical order.
    for (const [sortOrder, milestone] of spec.milestones.entries()) {
      const [row] = await db
        .select()
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.projectId, projectId),
            eq(projectMilestones.name, milestone.name),
          ),
        )
        .limit(1);
      if (row) {
        await db
          .update(projectMilestones)
          .set({
            date: milestone.date,
            description: milestone.description ?? null,
            sortOrder,
          })
          .where(eq(projectMilestones.id, row.id));
        milestoneIds.push(row.id);
      } else {
        const [inserted] = await db
          .insert(projectMilestones)
          .values({
            date: milestone.date,
            description: milestone.description ?? null,
            name: milestone.name,
            projectId,
            sortOrder,
          })
          .returning();
        milestoneIds.push(inserted.id);
      }
    }

    // Project dependency edges (predecessor must finish before successor).
    for (const dep of spec.dependencies) {
      const otherId = projectIdBySlug.get(dep.slug);
      if (!otherId) throw new Error(`Unknown dependency slug: ${dep.slug}`);
      const predecessorId = dep.type === 'blockedBy' ? otherId : projectId;
      const successorId = dep.type === 'blockedBy' ? projectId : otherId;
      const [edge] = await db
        .select({ id: projectDependencies.id })
        .from(projectDependencies)
        .where(
          and(
            eq(projectDependencies.predecessorId, predecessorId),
            eq(projectDependencies.successorId, successorId),
          ),
        )
        .limit(1);
      if (!edge) {
        await db.insert(projectDependencies).values({ predecessorId, successorId });
      }
    }

    // Label bindings (labels themselves were upserted at create; repair path
    // needs the same taxonomy on repeat runs).
    for (const name of spec.labels) {
      const [label] = await db
        .select()
        .from(projectLabels)
        .where(and(eq(projectLabels.workspaceId, workspaceId), eq(projectLabels.name, name)))
        .limit(1);
      const labelId =
        label?.id ??
        (
          await db
            .insert(projectLabels)
            .values({ name, workspaceId })
            .onConflictDoUpdate({
              set: { name },
              target: [projectLabels.workspaceId, projectLabels.name],
            })
            .returning()
        )[0].id;
      const [binding] = await db
        .select({ id: projectLabelBindings.id })
        .from(projectLabelBindings)
        .where(
          and(
            eq(projectLabelBindings.projectId, projectId),
            eq(projectLabelBindings.labelId, labelId),
          ),
        )
        .limit(1);
      if (!binding) await db.insert(projectLabelBindings).values({ labelId, projectId });
    }

    // External links (the PR-link surface on the project overview).
    for (const [index, link] of spec.links.entries()) {
      const linkId = volUuid(200 + projectIds.length * 10 + index);
      const [existingLink] = await db
        .select({ id: projectLinks.id })
        .from(projectLinks)
        .where(eq(projectLinks.id, linkId))
        .limit(1);
      if (existingLink) {
        await db
          .update(projectLinks)
          .set({ addedByUserId: userId, title: link.title, url: link.url })
          .where(eq(projectLinks.id, linkId));
      } else {
        await db.insert(projectLinks).values({
          addedByUserId: userId,
          id: linkId,
          projectId,
          title: link.title,
          url: link.url,
        });
      }
    }

    // Status updates / comments feeding the Updates rail + Activity feed.
    for (const [index, update] of spec.updates.entries()) {
      const updateId = volUuid(300 + projectIds.length * 10 + index);
      const [existingUpdate] = await db
        .select({ id: projectUpdates.id })
        .from(projectUpdates)
        .where(eq(projectUpdates.id, updateId))
        .limit(1);
      const row = {
        body: update.body,
        health: update.kind === 'comment' ? null : (update.health ?? null),
        kind: update.kind ?? ('update' as const),
        projectId,
        userId,
      };
      if (existingUpdate) {
        await db.update(projectUpdates).set(row).where(eq(projectUpdates.id, updateId));
      } else {
        await db.insert(projectUpdates).values({ ...row, id: updateId });
      }
    }
  }

  /* ── Tasks ── */
  const milestoneByProject = new Map<string, { id: string; sortOrder: number }[]>();
  for (const spec of VOLUME_PROJECTS) {
    const projectId = projectIdBySlug.get(spec.slug)!;
    const rows = await db
      .select({ id: projectMilestones.id, sortOrder: projectMilestones.sortOrder })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .orderBy(asc(projectMilestones.sortOrder));
    milestoneByProject.set(spec.slug, rows);
  }

  const taskIds = VOLUME_TASKS.map((spec) => spec.id);
  const identifiers = VOLUME_TASKS.map((spec) => spec.identifier);
  const existingById = await db.select().from(tasks).where(inArray(tasks.id, taskIds));
  const existingByIdentifier = await db
    .select({ id: tasks.id, identifier: tasks.identifier })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.identifier, identifiers)));

  const specById = new Map(VOLUME_TASKS.map((spec) => [spec.id, spec]));
  const specByIdentifier = new Map(VOLUME_TASKS.map((spec) => [spec.identifier, spec]));
  for (const row of existingById) {
    const spec = specById.get(row.id);
    if (
      !spec ||
      row.workspaceId !== workspaceId ||
      row.createdByUserId !== userId ||
      row.identifier !== spec.identifier ||
      row.isDeleted
    ) {
      throw new Error('A volume fixture task id belongs to another row');
    }
  }
  for (const row of existingByIdentifier) {
    const spec = specByIdentifier.get(row.identifier);
    if (!spec || row.id !== spec.id) {
      throw new Error('A non-fixture task occupies a volume fixture identifier');
    }
  }

  const existingIds = new Set(existingById.map(({ id }) => id));
  for (const spec of VOLUME_TASKS) {
    const teamId = teamIdByKey.get(spec.teamKey)!;
    const states = statesByTeam.get(spec.teamKey)!;
    const milestoneId =
      spec.projectSlug && spec.milestone !== undefined
        ? (milestoneByProject.get(spec.projectSlug)?.[spec.milestone]?.id ?? null)
        : null;
    const row = taskRow(spec, {
      cycleId: cycle.id,
      milestoneId,
      state: stateByCategory(states, spec.category),
      teamId,
      userId,
      workspaceId,
    });
    if (existingIds.has(spec.id)) {
      await db.update(tasks).set(row).where(eq(tasks.id, spec.id));
    } else {
      await db.insert(tasks).values(row);
    }
  }

  for (const edge of VOLUME_TASK_EDGES) {
    const [existing] = await db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, edge.taskId),
          eq(taskDependencies.dependsOnId, edge.dependsOnId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(taskDependencies)
        .set({ type: edge.type, userId, visibility: 'public', workspaceId })
        .where(eq(taskDependencies.id, existing.id));
    } else {
      await db.insert(taskDependencies).values({
        dependsOnId: edge.dependsOnId,
        taskId: edge.taskId,
        type: edge.type,
        userId,
        visibility: 'public',
        workspaceId,
      });
    }
  }

  /* ── Comments + task activity feed ── */
  const commentIds: string[] = [];
  for (const comment of VOLUME_COMMENTS) {
    const [existing] = await db
      .select({ id: taskComments.id })
      .from(taskComments)
      .where(eq(taskComments.id, comment.id))
      .limit(1);
    const row = {
      authorUserId: userId,
      content: comment.content,
      taskId: comment.taskId,
      userId,
      visibility: 'public' as const,
      workspaceId,
    };
    if (existing) {
      await db.update(taskComments).set(row).where(eq(taskComments.id, comment.id));
    } else {
      await db.insert(taskComments).values({ ...row, id: comment.id });
    }
    commentIds.push(comment.id);
  }

  for (const activity of VOLUME_ACTIVITIES) {
    const payload =
      activity.type === 'assignee_user' || activity.type === 'reviewer'
        ? {
            ...activity.payload,
            toId: activity.payload.toId === 'self' ? userId : activity.payload.toId,
          }
        : activity.payload;
    const row = {
      actorUserId: userId,
      createdAt: daysAgo(activity.daysOld),
      payload,
      taskId: activity.taskId,
      type: activity.type,
      userId,
      visibility: 'public' as const,
      workspaceId,
    };
    const [existing] = await db
      .select({ id: taskActivities.id })
      .from(taskActivities)
      .where(eq(taskActivities.id, activity.id))
      .limit(1);
    if (existing) {
      await db.update(taskActivities).set(row).where(eq(taskActivities.id, activity.id));
    } else {
      await db.insert(taskActivities).values({ ...row, id: activity.id });
    }
  }

  /* ── Subscriptions (My issues → Subscribed) ── */
  const subscriptionIds: string[] = [];
  for (const taskId of VOLUME_SUBSCRIBED_TASK_IDS) {
    const [existing] = await db
      .select()
      .from(taskSubscriptions)
      .where(and(eq(taskSubscriptions.taskId, taskId), eq(taskSubscriptions.userId, userId)))
      .limit(1);
    if (existing) {
      if (existing.unsubscribedAt) {
        await db
          .update(taskSubscriptions)
          .set({ unsubscribedAt: null })
          .where(eq(taskSubscriptions.id, existing.id));
      }
      subscriptionIds.push(existing.id);
    } else {
      const [inserted] = await db
        .insert(taskSubscriptions)
        .values({ reason: 'manual', taskId, userId, workspaceId })
        .returning();
      subscriptionIds.push(inserted.id);
    }
  }

  /* ── Pending approvals → Reviews external rows + live Inbox action cards ── */
  const approvalIds: string[] = [];
  for (const approval of VOLUME_APPROVALS) {
    if (approval.targetType === 'task' && !taskIds.includes(approval.targetId)) {
      throw new Error(`Unknown approval task target: ${approval.targetId}`);
    }
    const row = {
      actionSummary: approval.actionSummary,
      actionType: approval.actionType,
      approverUserId: approval.approverUserId === 'me' ? userId : null,
      baseSha: approval.baseSha ?? null,
      baseVersion: approval.baseVersion ?? null,
      requestedBy: userId,
      status: 'pending' as const,
      targetId: approval.targetId,
      targetType: approval.targetType,
      workspaceId,
    };
    const [existing] = await db
      .select({ id: actionApprovals.id })
      .from(actionApprovals)
      .where(eq(actionApprovals.id, approval.id))
      .limit(1);
    if (existing) {
      await db
        .update(actionApprovals)
        .set({ ...row, consumedAt: null, decidedAt: null })
        .where(eq(actionApprovals.id, approval.id));
    } else {
      await db.insert(actionApprovals).values({ ...row, id: approval.id });
    }
    approvalIds.push(approval.id);
  }

  /* ── Notifications (own dedupe prefix — replay replaces them) ── */
  const notificationModel = new NotificationModel(db, userId, { workspaceId });
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        like(notifications.dedupeKey, `${FIXTURE_DEDUPE_PREFIX}%`),
      ),
    );
  const notificationIds: string[] = [];
  for (const [index, row] of VOLUME_NOTIFICATIONS.entries()) {
    await notificationModel.create({
      ...row,
      lastActivityAt: new Date(NOW - index * 2 * 60 * 60 * 1000),
      workspaceId,
    });
    notificationIds.push(row.id);
  }

  /* ── Saved views + sidebar favorites ── */
  const savedViewIds: string[] = [];
  for (const view of VOLUME_SAVED_VIEWS) {
    const row = {
      displayOptions: view.displayOptions,
      entityType: view.query.entityType,
      layout: view.layout,
      name: view.name,
      ownerUserId: userId,
      queryAst: view.query,
      teamId: view.teamKey ? (teamIdByKey.get(view.teamKey) ?? null) : null,
      visibility: view.visibility,
      workspaceId,
    };
    const [existing] = await db
      .select({ id: savedViews.id })
      .from(savedViews)
      .where(eq(savedViews.id, view.id))
      .limit(1);
    if (existing) {
      await db.update(savedViews).set(row).where(eq(savedViews.id, view.id));
    } else {
      await db.insert(savedViews).values({ ...row, id: view.id });
    }
    savedViewIds.push(view.id);
  }

  const scopeKey = `ws:${workspaceId}`;
  const favoriteIds: string[] = [];
  for (const [index, favorite] of VOLUME_FAVORITES.entries()) {
    const targetId =
      favorite.targetType === 'project'
        ? projectIdBySlug.get(favorite.targetSlug)
        : favorite.targetType === 'savedView'
          ? favorite.savedViewId
          : teamIdByKey.get(favorite.teamKey);
    if (!targetId) throw new Error(`Unresolved favorite target: ${JSON.stringify(favorite)}`);
    const [existing] = await db
      .select({ id: navigationFavorites.id })
      .from(navigationFavorites)
      .where(
        and(
          eq(navigationFavorites.userId, userId),
          eq(navigationFavorites.scopeKey, scopeKey),
          eq(navigationFavorites.targetType, favorite.targetType),
          eq(navigationFavorites.targetId, targetId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(navigationFavorites)
        .set({ rank: favorite.rank })
        .where(eq(navigationFavorites.id, existing.id));
      favoriteIds.push(existing.id);
    } else {
      const id = volUuid(400 + index);
      await db.insert(navigationFavorites).values({
        id,
        rank: favorite.rank,
        scopeKey,
        targetId,
        targetType: favorite.targetType,
        userId,
        version: 1,
      });
      favoriteIds.push(id);
    }
  }

  /* ── Verify ── */
  const taskRows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.id, taskIds));
  if (taskRows.length !== VOLUME_TASKS.length) {
    throw new Error(
      `Volume fixture expected ${VOLUME_TASKS.length} tasks, found ${taskRows.length}`,
    );
  }
  const seededNotifications = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        like(notifications.dedupeKey, `${FIXTURE_DEDUPE_PREFIX}%`),
      ),
    );
  if (seededNotifications.length !== VOLUME_NOTIFICATIONS.length) {
    throw new Error(
      `Volume fixture expected ${VOLUME_NOTIFICATIONS.length} notifications, found ${seededNotifications.length}`,
    );
  }

  return {
    approvalIds,
    commentIds,
    favoriteIds,
    milestoneIds,
    notificationIds,
    projectIds,
    savedViewIds,
    subscriptionIds,
    taskIds,
    teamIds: [base.teamId, ship.id],
  };
};

/* ── Standalone entry ──────────────────────────────────────────────────── */

const main = async () => {
  if (process.env.ORVILO_PARITY_SEED_TARGET !== 'local') {
    throw new Error(
      'Refusing to seed parity volume: set ORVILO_PARITY_SEED_TARGET=local for the explicit local test target',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run the local dev environment bootstrap first.');
  }
  assertLocalParityDatabase(process.env.DATABASE_URL);

  const [{ serverDB }, { LINEAR_PARITY_USER, seedLinearParity }] = await Promise.all([
    import('../../packages/database/src/server'),
    import('../../packages/database/src/fixtures/linearParitySeed'),
  ]);

  try {
    const base = await seedLinearParity(serverDB, {
      target: 'local',
      userId: LINEAR_PARITY_USER.id,
      workspaceId: process.env.ORVILO_PARITY_WORKSPACE_ID,
    });
    const result = await seedLinearParityVolume(serverDB, {
      base,
      userId: LINEAR_PARITY_USER.id,
      workspaceId: base.workspaceId,
    });
    console.log(
      `Linear parity volume ready: workspace=${result.teamIds.length} teams projects=${result.projectIds.length} tasks=${result.taskIds.length} milestones=${result.milestoneIds.length} approvals=${result.approvalIds.length} notifications=${result.notificationIds.length} views=${result.savedViewIds.length} favorites=${result.favoriteIds.length}`,
    );
  } finally {
    await closeDatabase(serverDB);
  }
};

if (process.argv[1]?.endsWith('seedParityVolume.ts')) {
  main().catch((error) => {
    console.error(
      'Linear parity volume seed failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    process.exitCode = 1;
  });
}
