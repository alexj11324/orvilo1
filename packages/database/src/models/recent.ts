import type { ChatTopicStatus, TaskStatus } from '@orvilo/types';
import { and, desc, eq, exists, inArray, isNotNull, isNull, ne, not, or, sql } from 'drizzle-orm';
import { type AnyPgColumn, unionAll } from 'drizzle-orm/pg-core';
import removeMarkdown from 'remove-markdown';

import {
  agents,
  chatGroups,
  DOCUMENT_FOLDER_TYPE,
  documents,
  messages,
  projects,
  savedViews,
  tasks,
  teamMembers,
  teams,
  topics,
} from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildProjectReadableWhere } from '../utils/projectReadable';
import { notShareVisitorTopic } from '../utils/shareVisitor';
import { buildTaskTeamReadableWhere } from '../utils/taskTeamReadable';
import { buildWorkspaceWhere } from '../utils/workspace';

export interface RecentDbItem {
  description?: string | null;
  id: string;
  lastAssistantMessage?: string | null;
  metadata?: any;
  routeGroupId: string | null;
  routeId: string | null;
  /**
   * Slug source for a task link — the deliberate `tasks.name`, never the
   * instruction. `title` coalesces the two for display, but a prompt body must
   * not reach a URL, where it would land in history, analytics page views,
   * access logs and anything pasted from the clipboard.
   */
  slugTitle?: string | null;
  /** Task lifecycle status when `type === 'task'`; null for the other types. */
  status: TaskStatus | null;
  title: string;
  type: 'topic' | 'document' | 'task' | 'project' | 'savedView' | 'team';
  updatedAt: Date;
  /** The member who owns (created) this item — for author attribution in team views. */
  userId: string;
}

// Mirrors `MAIN_SIDEBAR_EXCLUDE_TRIGGERS` in `src/const/topic.ts` plus the
// legacy `task_manager` trigger from the previous Task Manager panel.
// System-trigger topics live in their own surfaces and would clutter Recent.
const SYSTEM_TOPIC_TRIGGERS = ['cron', 'eval', 'task_manager', 'task', 'document'];

// Excluded so tool-owned document rows don't surface as generic recent docs;
// only user-authored pages ('api') and legacy 'topic' rows remain.
const TOOL_DOCUMENT_SOURCE_TYPES = ['agent', 'agent-signal', 'file', 'web'] as const;

const TASK_FINAL_STATUSES = ['completed', 'canceled'];
const TOPIC_INBOX_STATUSES: ChatTopicStatus[] = ['running', 'unread'];
const LAST_MESSAGE_PREVIEW_LENGTH = 2000;

// A shared feed answers "what is the workspace working on", so a conversation
// owned by a PRIVATE agent/group never belongs in it — not even the viewer's
// own. `buildWorkspaceWhere` deliberately keeps a member's own private rows
// visible (correct for the "mine" feed), which is exactly what let a private
// agent's topic surface under the team tab. NULL counts as shared for rows
// that pre-date the column, matching `buildWorkspaceWhere`.
const sharedParentWhere = (visibility: AnyPgColumn) =>
  or(isNull(visibility), eq(visibility, 'public'));

// Best-effort markdown → plain text; previews render in a plain-text row, so
// syntax noise (**, #, []() …) would show up literally.
const toPlainTextPreview = (markdown: string): string => {
  try {
    return removeMarkdown(markdown).trimEnd();
  } catch {
    return markdown;
  }
};

export class RecentModel {
  private userId: string;
  private workspaceId?: string;
  private db: OrviloDatabase;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  queryRecent = async (
    limit: number = 10,
    types?: RecentDbItem['type'][],
    withTopicPreview?: boolean,
    mineOnly?: boolean,
    /**
     * Restrict a workspace feed to conversations the whole team can see, i.e.
     * drop topics whose owning agent/group is `visibility: 'private'`. Set by
     * the home "team" tab; the sidebar feed and the "mine" tab leave it off so
     * a member keeps their own private conversations. A no-op in personal mode,
     * where every row is the owner's already.
     */
    sharedOnly?: boolean,
  ): Promise<RecentDbItem[]> => {
    const scope = { userId: this.userId, workspaceId: this.workspaceId };
    const requestedTypes = types ? new Set(types) : undefined;

    // Tasks use `createdByUserId` instead of `userId`. Match TaskModel.ownership:
    // workspace visibility, then private-team membership (TRI05 / SEC06).
    const taskVisible = buildWorkspaceWhere(scope, {
      userId: tasks.createdByUserId,
      visibility: tasks.visibility,
      workspaceId: tasks.workspaceId,
    });
    const taskScopeWhere = this.workspaceId
      ? and(taskVisible, buildTaskTeamReadableWhere(this.db, this.userId))
      : taskVisible;

    // Workspace rows are shared across members; `mineOnly` narrows a workspace
    // feed back to the viewer's own items. A no-op in personal mode, where the
    // scope predicate already pins the user.
    const mineTopicWhere = mineOnly ? eq(topics.userId, this.userId) : undefined;
    const mineDocumentWhere = mineOnly ? eq(documents.userId, this.userId) : undefined;
    const mineTaskWhere = mineOnly ? eq(tasks.createdByUserId, this.userId) : undefined;
    const mineProjectWhere = mineOnly ? eq(projects.userId, this.userId) : undefined;
    const mineSavedViewWhere = mineOnly ? eq(savedViews.ownerUserId, this.userId) : undefined;
    const mineTeamWhere = mineOnly ? eq(teams.createdByUserId, this.userId) : undefined;

    const teamMembership = (teamId: AnyPgColumn) =>
      exists(
        this.db
          .select({ one: sql`1` })
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, this.userId))),
      );

    const projectReadable = buildProjectReadableWhere(this.db, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });

    // Mirrors `TeamModel.readable`: public teams plus private teams the viewer
    // belongs to. Teams are workspace-only — personal mode yields no rows.
    const teamReadable = this.workspaceId
      ? and(
          eq(teams.workspaceId, this.workspaceId),
          or(eq(teams.visibility, 'public'), teamMembership(teams.id)),
        )
      : sql`false`;

    // Mirrors `SavedViewModel.readable`: own views plus workspace-shared and
    // team-shared views the viewer's membership covers.
    const savedViewReadable = this.workspaceId
      ? and(
          eq(savedViews.workspaceId, this.workspaceId),
          or(
            eq(savedViews.ownerUserId, this.userId),
            eq(savedViews.visibility, 'workspace'),
            and(eq(savedViews.visibility, 'team'), teamMembership(savedViews.teamId)),
          ),
        )
      : and(eq(savedViews.ownerUserId, this.userId), isNull(savedViews.workspaceId));

    const topicArm = this.db
      .select({
        description: withTopicPreview
          ? topics.description
          : sql<string | null>`NULL`.as('description'),
        id: topics.id,
        metadata: sql<any>`${topics.metadata}`.as('metadata'),
        routeGroupId: sql<string | null>`${topics.groupId}`.as('route_group_id'),
        routeId: sql<string | null>`${topics.agentId}`.as('route_id'),
        slugTitle: sql<string | null>`NULL`.as('slug_title'),
        status: sql<TaskStatus | null>`NULL`.as('status'),
        title: sql<string>`COALESCE(${topics.title}, 'Untitled Topic')`.as('title'),
        type: sql<RecentDbItem['type']>`'topic'`.as('type'),
        updatedAt: topics.updatedAt,
        userId: topics.userId,
      })
      .from(topics)
      .leftJoin(agents, eq(topics.agentId, agents.id))
      .leftJoin(chatGroups, eq(topics.groupId, chatGroups.id))
      .where(
        requestedTypes && !requestedTypes.has('topic')
          ? sql`false`
          : and(
              buildWorkspaceWhere(scope, topics),
              // Agent-share visitor topics keep the creator's userId — never
              // surface a visitor's conversation in the creator's own Recent feed.
              notShareVisitorTopic(),
              mineTopicWhere,
              // Topic scope alone is insufficient: stale/mismatched rows can
              // point at a personal or foreign-workspace agent/group. Check
              // the parent scope before returning titles or loading previews.
              or(
                and(
                  isNotNull(topics.groupId),
                  buildWorkspaceWhere(scope, chatGroups),
                  sharedOnly ? sharedParentWhere(chatGroups.visibility) : undefined,
                ),
                and(
                  isNull(topics.groupId),
                  buildWorkspaceWhere(scope, agents),
                  sharedOnly ? sharedParentWhere(agents.visibility) : undefined,
                  or(eq(agents.slug, 'inbox'), ne(agents.virtual, true)),
                ),
              ),
              or(isNull(topics.trigger), not(inArray(topics.trigger, SYSTEM_TOPIC_TRIGGERS))),
              or(isNull(topics.status), not(inArray(topics.status, TOPIC_INBOX_STATUSES))),
            ),
      );

    const documentArm = this.db
      .select({
        description: sql<string | null>`NULL`.as('description'),
        id: documents.id,
        metadata: sql<any>`NULL`.as('metadata'),
        routeGroupId: sql<string | null>`NULL`.as('route_group_id'),
        routeId: sql<string | null>`NULL`.as('route_id'),
        slugTitle: sql<string | null>`NULL`.as('slug_title'),
        status: sql<TaskStatus | null>`NULL`.as('status'),
        title:
          sql<string>`COALESCE(${documents.title}, ${documents.filename}, 'Untitled Document')`.as(
            'title',
          ),
        type: sql<RecentDbItem['type']>`'document'`.as('type'),
        updatedAt: documents.updatedAt,
        userId: documents.userId,
      })
      .from(documents)
      .where(
        requestedTypes && !requestedTypes.has('document')
          ? sql`false`
          : and(
              buildWorkspaceWhere(scope, documents),
              mineDocumentWhere,
              not(inArray(documents.sourceType, TOOL_DOCUMENT_SOURCE_TYPES)),
              isNull(documents.knowledgeBaseId),
              ne(documents.fileType, DOCUMENT_FOLDER_TYPE),
            ),
      );

    const taskArm = this.db
      .select({
        description: sql<string | null>`NULL`.as('description'),
        id: tasks.id,
        metadata: sql<any>`NULL`.as('metadata'),
        routeGroupId: sql<string | null>`NULL`.as('route_group_id'),
        routeId: sql<string | null>`${tasks.assigneeAgentId}`.as('route_id'),
        // Display title falls back to the instruction so a nameless task still
        // reads as something; `slugTitle` deliberately does not, so the link
        // this row builds carries only what the task was actually named.
        slugTitle: sql<string | null>`${tasks.name}`.as('slug_title'),
        status: sql<TaskStatus | null>`${tasks.status}`.as('status'),
        title: sql<string>`COALESCE(${tasks.name}, ${tasks.instruction}, 'Untitled Task')`.as(
          'title',
        ),
        type: sql<RecentDbItem['type']>`'task'`.as('type'),
        updatedAt: tasks.updatedAt,
        userId: sql<string>`${tasks.createdByUserId}`.as('user_id'),
      })
      .from(tasks)
      .where(
        requestedTypes && !requestedTypes.has('task')
          ? sql`false`
          : and(taskScopeWhere, mineTaskWhere, not(inArray(tasks.status, TASK_FINAL_STATUSES))),
      );

    const projectArm = this.db
      .select({
        description: sql<string | null>`NULL`.as('description'),
        id: projects.id,
        metadata: sql<any>`NULL`.as('metadata'),
        routeGroupId: sql<string | null>`NULL`.as('route_group_id'),
        routeId: sql<string | null>`NULL`.as('route_id'),
        slugTitle: sql<string | null>`NULL`.as('slug_title'),
        status: sql<TaskStatus | null>`NULL`.as('status'),
        title: sql<string>`${projects.name}`.as('title'),
        type: sql<RecentDbItem['type']>`'project'`.as('type'),
        updatedAt: projects.updatedAt,
        userId: sql<string>`COALESCE(${projects.userId}, '')`.as('user_id'),
      })
      .from(projects)
      .where(
        requestedTypes && !requestedTypes.has('project')
          ? sql`false`
          : and(
              projectReadable,
              mineProjectWhere,
              // sharedOnly keeps only rows the whole workspace can read —
              // a member grant shares a project with named members, not the
              // team at large.
              sharedOnly
                ? this.workspaceId
                  ? and(
                      eq(projects.workspaceId, this.workspaceId),
                      eq(projects.visibility, 'public'),
                    )
                  : sql`false`
                : undefined,
            ),
      );

    const savedViewArm = this.db
      .select({
        description: sql<string | null>`NULL`.as('description'),
        id: savedViews.id,
        metadata: sql<any>`NULL`.as('metadata'),
        routeGroupId: sql<string | null>`NULL`.as('route_group_id'),
        routeId: sql<string | null>`NULL`.as('route_id'),
        slugTitle: sql<string | null>`NULL`.as('slug_title'),
        status: sql<TaskStatus | null>`NULL`.as('status'),
        title: sql<string>`${savedViews.name}`.as('title'),
        type: sql<RecentDbItem['type']>`'savedView'`.as('type'),
        updatedAt: savedViews.updatedAt,
        userId: savedViews.ownerUserId,
      })
      .from(savedViews)
      .where(
        requestedTypes && !requestedTypes.has('savedView')
          ? sql`false`
          : and(
              savedViewReadable,
              mineSavedViewWhere,
              sharedOnly ? inArray(savedViews.visibility, ['team', 'workspace']) : undefined,
            ),
      );

    const teamArm = this.db
      .select({
        description: sql<string | null>`${teams.description}`.as('description'),
        id: teams.id,
        metadata: sql<any>`NULL`.as('metadata'),
        routeGroupId: sql<string | null>`NULL`.as('route_group_id'),
        routeId: sql<string | null>`NULL`.as('route_id'),
        slugTitle: sql<string | null>`NULL`.as('slug_title'),
        status: sql<TaskStatus | null>`NULL`.as('status'),
        title: sql<string>`${teams.name}`.as('title'),
        type: sql<RecentDbItem['type']>`'team'`.as('type'),
        updatedAt: teams.updatedAt,
        userId: sql<string>`COALESCE(${teams.createdByUserId}, '')`.as('user_id'),
      })
      .from(teams)
      .where(
        requestedTypes && !requestedTypes.has('team')
          ? sql`false`
          : and(
              teamReadable,
              mineTeamWhere,
              sharedOnly ? eq(teams.visibility, 'public') : undefined,
            ),
      );

    const rows = await unionAll(topicArm, documentArm, taskArm, projectArm, savedViewArm, teamArm)
      .orderBy(desc(sql`updated_at`))
      .limit(limit);

    // Previews are fetched in a second batched query scoped to the final page
    // — inlining a correlated subquery in the topic arm would evaluate it for
    // every topic the user owns before the sort/limit prunes to `limit` rows.
    const previewByTopicId = withTopicPreview
      ? await this.queryLastAssistantPreviews(
          rows.filter((row) => row.type === 'topic').map((row) => row.id),
        )
      : new Map<string, string>();

    return rows.map((row) => {
      const preview = previewByTopicId.get(row.id) ?? null;
      return {
        description: row.description,
        id: row.id,
        lastAssistantMessage:
          preview && preview.length > LAST_MESSAGE_PREVIEW_LENGTH
            ? `${preview.slice(0, LAST_MESSAGE_PREVIEW_LENGTH)}…`
            : preview,
        metadata: row.metadata ?? undefined,
        routeGroupId: row.routeGroupId,
        routeId: row.routeId,
        slugTitle: row.slugTitle,
        status: row.status,
        title: row.title,
        type: row.type,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt as any),
        userId: row.userId,
      };
    });
  };

  private queryLastAssistantPreviews = async (topicIds: string[]): Promise<Map<string, string>> => {
    if (topicIds.length === 0) return new Map();

    const rows = await this.db
      .selectDistinctOn([messages.topicId], {
        topicId: messages.topicId,
        value: sql<string>`left(${messages.content}, ${LAST_MESSAGE_PREVIEW_LENGTH + 1})`,
      })
      .from(messages)
      .where(
        and(
          inArray(messages.topicId, topicIds),
          eq(messages.role, 'assistant'),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, messages),
          ne(messages.content, ''),
        ),
      )
      .orderBy(messages.topicId, desc(messages.createdAt));

    return new Map(
      rows
        .filter((row) => row.topicId !== null)
        .map((row) => [row.topicId!, toPlainTextPreview(row.value)]),
    );
  };
}
