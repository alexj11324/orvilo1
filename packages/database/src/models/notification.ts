import type {
  ActionSourceKind,
  NotificationBulkAction,
  NotificationFeedKind,
  NotificationPresentationFilter,
} from '@orvilo/types';
import {
  NOTIFICATION_BULK_PREPARE_LIMIT,
  NOTIFICATION_BULK_PREPARE_WINDOW_MS,
  notificationScopeKey,
  parseNotificationBulkFingerprint,
} from '@orvilo/types';
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import type { NewNotification, NewNotificationDelivery } from '../schemas/notification';
import { notificationDeliveries, notifications } from '../schemas/notification';
import { projects } from '../schemas/project';
import { tasks } from '../schemas/task';
import { notificationBulkSnapshots, notificationEventReceipts } from '../schemas/workAttention';
import type { OrviloDatabase, Transaction } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';
import { allocateFeedRevision, currentFeedRevision } from './notificationFeed';

export class NotificationBulkError extends Error {
  constructor(
    readonly code: 'CONSUMED' | 'EXPIRED' | 'FORBIDDEN_ACTION' | 'NOT_FOUND' | 'RATE_LIMITED',
  ) {
    super(code);
    this.name = 'NotificationBulkError';
  }
}

export interface NotificationModelOptions {
  /**
   * Inbox context scope. `null` = personal mode (only rows with
   * `workspace_id IS NULL`); a workspace id = only that workspace's rows.
   * Omit for context-free access (write side / ops tooling), where read
   * queries span both personal and workspace notifications.
   */
  workspaceId?: string | null;
}

export class NotificationModel {
  private readonly userId: string;
  private readonly db: OrviloDatabase;
  private readonly workspaceId?: string | null;

  constructor(db: OrviloDatabase, userId: string, options?: NotificationModelOptions) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = options?.workspaceId;
  }

  private ownership = () => eq(notifications.userId, this.userId);

  /** Context conditions: ownership plus the workspace/personal scope when set */
  private scope = (): SQL[] => {
    const conditions: SQL[] = [this.ownership()];
    if (this.workspaceId === null) conditions.push(isNull(notifications.workspaceId));
    else if (this.workspaceId) conditions.push(eq(notifications.workspaceId, this.workspaceId));
    return conditions;
  };

  /**
   * Live ACL: a historical delivery is not proof the recipient can still read
   * the object. Missing/unknown resource types stay visible (system cards).
   */
  private resourceReadable = (): SQL => {
    const taskVisible = buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId ?? undefined },
      {
        userId: tasks.createdByUserId,
        visibility: tasks.visibility,
        workspaceId: tasks.workspaceId,
      },
    );
    const projectVisible = this.workspaceId
      ? eq(projects.workspaceId, this.workspaceId)
      : and(eq(projects.userId, this.userId), isNull(projects.workspaceId))!;
    return or(
      isNull(notifications.resourceType),
      sql`${notifications.resourceType} not in ('task', 'project')`,
      sql`(${notifications.resourceType} = 'task' and exists (select 1 from ${tasks} where ${tasks.id} = ${notifications.resourceId} and ${taskVisible}))`,
      sql`(${notifications.resourceType} = 'project' and exists (select 1 from ${projects} where ${projects.id} = ${notifications.resourceId} and ${projectVisible}))`,
    )!;
  };

  private presentationWhere = (filter?: NotificationPresentationFilter): SQL[] => {
    const now = new Date();
    switch (filter) {
      case 'unread': {
        return [
          eq(notifications.isArchived, false),
          or(
            eq(notifications.isRead, false),
            and(eq(notifications.kind, 'action'), isNull(notifications.resolvedAt)),
          )!,
        ];
      }
      case 'archived': {
        return [eq(notifications.isArchived, true)];
      }
      case 'snoozed': {
        return [
          sql`${notifications.snoozedUntil} is not null and ${notifications.snoozedUntil} > ${now}`,
        ];
      }
      case 'mentions': {
        return [eq(notifications.isArchived, false), eq(notifications.category, 'mention')];
      }
      default: {
        return [eq(notifications.isArchived, false)];
      }
    }
  };

  private feedWhere = (opts: {
    filter?: Exclude<NotificationPresentationFilter, 'all'>;
    kind?: NotificationFeedKind;
  }): SQL[] => {
    const conditions: SQL[] = [...this.scope(), this.resourceReadable()];
    if (opts.kind === 'action') {
      conditions.push(eq(notifications.kind, 'action'), isNull(notifications.resolvedAt));
      if (opts.filter === 'archived' || opts.filter === 'snoozed') {
        conditions.push(...this.presentationWhere(opts.filter));
      }
    } else {
      conditions.push(...this.presentationWhere(opts.filter));
      if (opts.kind) conditions.push(eq(notifications.kind, opts.kind));
    }
    return conditions;
  };

  async list(
    opts: {
      category?: string;
      cursor?: string;
      isRead?: boolean;
      limit?: number;
      unreadOnly?: boolean;
    } = {},
  ) {
    const { cursor, limit = 20, category, isRead, unreadOnly } = opts;

    const conditions = [
      ...this.scope(),
      this.resourceReadable(),
      eq(notifications.isArchived, false),
    ];

    if (typeof isRead === 'boolean') {
      conditions.push(eq(notifications.isRead, isRead));
    } else if (unreadOnly) {
      // Keep old desktop clients working while the notification center moves
      // to the explicit read / unread tabs.
      conditions.push(eq(notifications.isRead, false));
    }

    if (category) {
      conditions.push(eq(notifications.category, category));
    }

    if (cursor) {
      const cursorRow = await this.db
        .select({ createdAt: notifications.createdAt, id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.id, cursor), ...this.scope()))
        .limit(1);

      if (cursorRow[0]) {
        // Composite cursor to handle identical createdAt timestamps
        const { createdAt: cursorTime, id: cursorId } = cursorRow[0];
        conditions.push(
          or(
            lt(notifications.createdAt, cursorTime),
            and(eq(notifications.createdAt, cursorTime), lt(notifications.id, cursorId)),
          )!,
        );
      }
    }

    return this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
  }

  async getNavigationCounts() {
    const rows = await this.db
      .select({
        category: notifications.category,
        count: count(),
        isRead: notifications.isRead,
      })
      .from(notifications)
      .where(and(...this.scope(), this.resourceReadable(), eq(notifications.isArchived, false)))
      .groupBy(notifications.category, notifications.isRead);

    const counts = new Map<
      string,
      { category: string; readCount: number; totalCount: number; unreadCount: number }
    >();
    for (const row of rows) {
      const categoryCounts = counts.get(row.category) ?? {
        category: row.category,
        readCount: 0,
        totalCount: 0,
        unreadCount: 0,
      };

      categoryCounts.totalCount += row.count;
      if (row.isRead) categoryCounts.readCount += row.count;
      else categoryCounts.unreadCount += row.count;
      counts.set(row.category, categoryCounts);
    }

    return [...counts.values()];
  }

  /**
   * Unarchived `pending`-category rows linked (via
   * `metadata.transfer.requestId`) to the given live transfer requests, split
   * into total and unread. Navigation counts use this to swap row-based
   * counting for request-based counting on the pending category: a linked
   * row's read state must not hide a still-unresolved request, and a live
   * request whose linked row is missing/archived must still count toward the
   * totals its rendered card contributes to. Scoped to the pending category
   * because only rows counted there may be swapped out — a linked row that
   * landed in another category counts toward that category, not against the
   * requests.
   */
  async countLinkedToTransfers(requestIds: string[]): Promise<{ total: number; unread: number }> {
    if (requestIds.length === 0) return { total: 0, unread: 0 };

    const [result] = await this.db
      .select({
        total: count(),
        // count() skips NULLs, so the CASE narrows the aggregate to unread rows.
        unread: count(sql`case when ${notifications.isRead} = false then 1 end`),
      })
      .from(notifications)
      .where(
        and(
          ...this.scope(),
          eq(notifications.category, 'pending'),
          eq(notifications.isArchived, false),
          this.resourceReadable(),
          inArray(sql`${notifications.metadata} -> 'transfer' ->> 'requestId'`, requestIds),
        ),
      );

    return { total: result?.total ?? 0, unread: result?.unread ?? 0 };
  }

  async getUnreadCount(): Promise<number> {
    // Same union as the sidebar badge / Inbox header: unread updates plus
    // unresolved actions, even after the row was marked read. Read ≠ decided.
    const summary = await this.getFeedSummary();
    return summary.unreadBadgeCount;
  }

  async getFeedSummary(opts?: { excludePendingActionRequestIds?: string[] }) {
    const now = new Date();
    const excluded = opts?.excludePendingActionRequestIds?.filter(Boolean) ?? [];
    const pendingExclude =
      excluded.length > 0
        ? sql`and (${notifications.actionRequestId} is null or ${notInArray(notifications.actionRequestId, excluded)})`
        : sql``;
    const [row] = await this.db
      .select({
        pendingActionCount: count(
          sql`case when ${notifications.kind} = 'action' and ${notifications.resolvedAt} is null ${pendingExclude} then 1 end`,
        ),
        snoozedPendingCount: count(
          sql`case when ${notifications.kind} = 'action' and ${notifications.resolvedAt} is null and ${notifications.snoozedUntil} is not null and ${notifications.snoozedUntil} > ${now} then 1 end`,
        ),
        unreadBadgeCount: count(
          sql`case when ${notifications.isArchived} = false and (${notifications.isRead} = false or (${notifications.kind} = 'action' and ${notifications.resolvedAt} is null)) and (${notifications.snoozedUntil} is null or ${notifications.snoozedUntil} <= ${now}) then 1 end`,
        ),
        unreadUpdateCount: count(
          sql`case when ${notifications.kind} = 'update' and ${notifications.isRead} = false and ${notifications.isArchived} = false then 1 end`,
        ),
      })
      .from(notifications)
      .where(and(...this.scope(), this.resourceReadable()));

    return {
      pendingActionCount: Number(row?.pendingActionCount ?? 0),
      snoozedPendingCount: Number(row?.snoozedPendingCount ?? 0),
      unreadBadgeCount: Number(row?.unreadBadgeCount ?? 0),
      unreadUpdateCount: Number(row?.unreadUpdateCount ?? 0),
    };
  }

  async listFeed(
    opts: {
      cursor?: string;
      filter?: NotificationPresentationFilter;
      kind?: NotificationFeedKind;
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const conditions: SQL[] = [
      ...this.feedWhere({
        filter: opts.filter === 'all' ? undefined : opts.filter,
        kind: opts.kind,
      }),
    ];

    if (opts.cursor) {
      const cursorRow = await this.db
        .select({
          id: notifications.id,
          lastActivityAt: notifications.lastActivityAt,
        })
        .from(notifications)
        .where(and(eq(notifications.id, opts.cursor), ...this.scope()))
        .limit(1);
      if (cursorRow[0]) {
        const cursorTime = cursorRow[0].lastActivityAt ?? new Date(0);
        conditions.push(
          or(
            lt(notifications.lastActivityAt, cursorTime),
            and(
              eq(notifications.lastActivityAt, cursorTime),
              lt(notifications.id, cursorRow[0].id),
            ),
          )!,
        );
      }
    }

    return this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(
        desc(notifications.lastActivityAt),
        desc(notifications.createdAt),
        desc(notifications.id),
      )
      .limit(limit);
  }

  async markAsRead(ids: string[]) {
    if (ids.length === 0) return;

    return this.db
      .update(notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(and(...this.scope(), inArray(notifications.id, ids)));
  }

  async markAllAsRead() {
    return this.markAllAsReadSnapshot();
  }

  async archive(id: string) {
    return this.db
      .update(notifications)
      .set({ archivedAt: new Date(), isArchived: true, updatedAt: new Date() })
      .where(and(eq(notifications.id, id), ...this.scope()));
  }

  /**
   * Archive the version the caller actually displayed. A newer event that
   * landed after the preview stays unarchived.
   */
  async archiveObserved(id: string, expectedVersion: number) {
    return this.db
      .update(notifications)
      .set({ archivedAt: new Date(), isArchived: true, updatedAt: new Date() })
      .where(
        and(
          ...this.scope(),
          eq(notifications.id, id),
          eq(notifications.activityVersion, expectedVersion),
        ),
      );
  }

  async archiveAll(
    cutoffRevision?: number,
    query: {
      filter?: Exclude<NotificationPresentationFilter, 'all'>;
      kind?: NotificationFeedKind;
    } = {},
  ) {
    const cutoff = cutoffRevision ?? (await this.snapshotCutoff());
    return this.db
      .update(notifications)
      .set({ archivedAt: new Date(), isArchived: true, updatedAt: new Date() })
      .where(
        and(
          ...this.feedWhere(query),
          or(eq(notifications.kind, 'update'), sql`${notifications.resolvedAt} is not null`)!,
          sql`${notifications.latestFeedRevision} <= ${cutoff}`,
        ),
      );
  }

  /**
   * Capture the feed revision the caller actually observed. applyBulk will
   * only touch cards at or below this cutoff — never a later event.
   */
  async prepareBulk(params: { action: NotificationBulkAction; queryFingerprint: string }) {
    if (params.action !== 'archive' && params.action !== 'mark_read') {
      throw new NotificationBulkError('FORBIDDEN_ACTION');
    }
    if (!parseNotificationBulkFingerprint(params.action, params.queryFingerprint)) {
      throw new NotificationBulkError('FORBIDDEN_ACTION');
    }
    const windowStart = new Date(Date.now() - NOTIFICATION_BULK_PREPARE_WINDOW_MS);
    const [recent] = await this.db
      .select({ total: count() })
      .from(notificationBulkSnapshots)
      .where(
        and(
          eq(notificationBulkSnapshots.userId, this.userId),
          eq(notificationBulkSnapshots.scopeKey, notificationScopeKey(this.workspaceId)),
          gt(notificationBulkSnapshots.createdAt, windowStart),
        ),
      );
    if (Number(recent?.total ?? 0) >= NOTIFICATION_BULK_PREPARE_LIMIT) {
      throw new NotificationBulkError('RATE_LIMITED');
    }
    const cutoffRevision = await this.snapshotCutoff();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const [row] = await this.db
      .insert(notificationBulkSnapshots)
      .values({
        action: params.action,
        cutoffRevision,
        expiresAt,
        queryFingerprint: params.queryFingerprint,
        scopeKey: notificationScopeKey(this.workspaceId),
        userId: this.userId,
      })
      .returning();
    return { cutoffRevision, expiresAt, token: row.id };
  }

  async applyBulk(token: string) {
    const now = new Date();
    const [claimed] = await this.db
      .update(notificationBulkSnapshots)
      .set({ consumedAt: now })
      .where(
        and(
          eq(notificationBulkSnapshots.id, token),
          eq(notificationBulkSnapshots.userId, this.userId),
          eq(notificationBulkSnapshots.scopeKey, notificationScopeKey(this.workspaceId)),
          isNull(notificationBulkSnapshots.consumedAt),
          gt(notificationBulkSnapshots.expiresAt, now),
        ),
      )
      .returning();
    if (!claimed) {
      const [snapshot] = await this.db
        .select()
        .from(notificationBulkSnapshots)
        .where(
          and(
            eq(notificationBulkSnapshots.id, token),
            eq(notificationBulkSnapshots.userId, this.userId),
            eq(notificationBulkSnapshots.scopeKey, notificationScopeKey(this.workspaceId)),
          ),
        )
        .limit(1);
      if (!snapshot) throw new NotificationBulkError('NOT_FOUND');
      if (snapshot.consumedAt) throw new NotificationBulkError('CONSUMED');
      throw new NotificationBulkError('EXPIRED');
    }

    const query = parseNotificationBulkFingerprint(claimed.action, claimed.queryFingerprint);
    if (!query) throw new NotificationBulkError('FORBIDDEN_ACTION');

    if (claimed.action === 'archive') {
      await this.archiveAll(claimed.cutoffRevision, query);
    } else if (claimed.action === 'mark_read') {
      await this.markAllAsReadAt(claimed.cutoffRevision, query);
    } else {
      throw new NotificationBulkError('FORBIDDEN_ACTION');
    }

    return { cutoffRevision: claimed.cutoffRevision, success: true };
  }

  private async snapshotCutoff() {
    const feedRevision = await currentFeedRevision(this.db, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    if (feedRevision > 0) return feedRevision;
    const [row] = await this.db
      .select({
        max: sql<number>`coalesce(max(${notifications.latestFeedRevision}), 0)`,
      })
      .from(notifications)
      .where(and(...this.scope()));
    return Number(row?.max ?? 0);
  }

  private async markAllAsReadAt(
    cutoffRevision: number,
    query: {
      filter?: Exclude<NotificationPresentationFilter, 'all'>;
      kind?: NotificationFeedKind;
    } = {},
  ) {
    const now = new Date();
    return this.db
      .update(notifications)
      .set({
        isRead: true,
        readVersion: sql`${notifications.activityVersion}`,
        updatedAt: now,
      })
      .where(
        and(
          ...this.feedWhere(query),
          eq(notifications.isRead, false),
          sql`${notifications.latestFeedRevision} <= ${cutoffRevision}`,
        ),
      );
  }

  /**
   * Confirm only the activityVersion the caller actually displayed. A newer
   * event that landed as v6 while the user marked v5 stays unread.
   */
  async markReadObserved(id: string, observedVersion: number) {
    const now = new Date();
    return this.db
      .update(notifications)
      .set({
        isRead: sql`${notifications.activityVersion} <= ${observedVersion}`,
        readVersion: sql`GREATEST(${notifications.readVersion}, ${observedVersion})`,
        updatedAt: now,
      })
      .where(
        and(
          ...this.scope(),
          eq(notifications.id, id),
          sql`${notifications.readVersion} < ${observedVersion}`,
        ),
      );
  }

  /**
   * Mark-all uses a statement snapshot of the current feed revision so events
   * that commit after this statement started are not cleared.
   */
  async markAllAsReadSnapshot() {
    return this.markAllAsReadAt(await this.snapshotCutoff());
  }

  async snooze(id: string, until: Date, expectedVersion: number) {
    return this.db
      .update(notifications)
      .set({ snoozedUntil: until, updatedAt: new Date() })
      .where(
        and(
          ...this.scope(),
          eq(notifications.id, id),
          eq(notifications.activityVersion, expectedVersion),
        ),
      );
  }

  async markUnreadObserved(id: string, expectedVersion: number) {
    return this.db
      .update(notifications)
      .set({ isRead: false, readVersion: 0, updatedAt: new Date() })
      .where(
        and(
          ...this.scope(),
          eq(notifications.id, id),
          eq(notifications.activityVersion, expectedVersion),
        ),
      );
  }

  // ─── Write-side (used by NotificationService in cloud) ─────────

  async create(data: Omit<NewNotification, 'userId'>) {
    const [result] = await this.db
      .insert(notifications)
      .values({
        ...data,
        lastActivityAt: data.lastActivityAt ?? new Date(),
        userId: this.userId,
      })
      .onConflictDoNothing({
        target: [notifications.userId, notifications.dedupeKey],
      })
      .returning();

    return result ?? null;
  }

  async createDelivery(data: NewNotificationDelivery) {
    const [result] = await this.db.insert(notificationDeliveries).values(data).returning();

    return result;
  }

  async recordEventReceipt(
    executor: Transaction | OrviloDatabase,
    params: {
      consumer: string;
      eventId: string;
      kind: string;
      notificationId?: string;
      recipientUserId: string;
    },
  ): Promise<boolean> {
    const inserted = await executor
      .insert(notificationEventReceipts)
      .values({
        consumer: params.consumer,
        eventId: params.eventId,
        kind: params.kind,
        notificationId: params.notificationId,
        recipientUserId: params.recipientUserId,
      })
      .onConflictDoNothing({
        target: [
          notificationEventReceipts.consumer,
          notificationEventReceipts.eventId,
          notificationEventReceipts.recipientUserId,
          notificationEventReceipts.kind,
        ],
      })
      .returning({ id: notificationEventReceipts.id });
    return inserted.length > 0;
  }

  async bumpEpisode(
    executor: Transaction | OrviloDatabase,
    params: {
      episodeKey: string;
      feedRevision: number;
      recipientUserId: string;
      title?: string;
      content?: string;
    },
  ) {
    const now = new Date();
    const [row] = await executor
      .update(notifications)
      .set({
        activityVersion: sql`${notifications.activityVersion} + 1`,
        ...(params.content !== undefined ? { content: params.content } : {}),
        isArchived: false,
        isRead: false,
        lastActivityAt: now,
        latestFeedRevision: params.feedRevision,
        snoozedUntil: null,
        ...(params.title !== undefined ? { title: params.title } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(notifications.userId, params.recipientUserId),
          eq(notifications.episodeKey, params.episodeKey),
        ),
      )
      .returning();
    return row;
  }

  async resolveAction(requestId: string) {
    return this.db
      .update(notifications)
      .set({ resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(...this.scope(), eq(notifications.actionRequestId, requestId)));
  }

  /**
   * Repair missing Inbox projections from live source requests. Existing
   * cards (including archived unresolved actions) are left in place.
   */
  async ensureActionCards(
    items: Array<{
      actionKind: ActionSourceKind;
      content: string;
      requestId: string;
      resourceId?: string;
      resourceType?: string;
      title: string;
    }>,
  ) {
    if (items.length === 0) return;

    const existing = await this.db
      .select({ actionRequestId: notifications.actionRequestId })
      .from(notifications)
      .where(
        and(
          ...this.scope(),
          inArray(
            notifications.actionRequestId,
            items.map((item) => item.requestId),
          ),
        ),
      );
    const have = new Set(existing.map((row) => row.actionRequestId));

    for (const item of items) {
      if (have.has(item.requestId)) continue;
      const revision = await allocateFeedRevision(this.db, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      await this.create({
        actionKind: item.actionKind,
        actionRequestId: item.requestId,
        activityVersion: 1,
        category: 'pending',
        content: item.content,
        dedupeKey: `action:${item.actionKind}:${item.requestId}:${this.userId}`,
        episodeKey: `action:${item.requestId}`,
        kind: 'action',
        lastActivityAt: new Date(),
        latestFeedRevision: revision,
        resourceId: item.resourceId,
        resourceType: item.resourceType,
        title: item.title,
        type: item.actionKind,
        ...(typeof this.workspaceId === 'string' ? { workspaceId: this.workspaceId } : {}),
      });
    }
  }
}
