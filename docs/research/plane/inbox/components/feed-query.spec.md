# FeedQuery Specification (server contract)

## Overview

- **Target files:**
  - `packages/types/src/workAttention.ts` — `NotificationFeedTypeFilter`, `resourceIdentifier` on `NotificationFeedCard`
  - `packages/database/src/models/notification.ts` — `feedWhere`/`listFeed`/`getFeedSummary`, `unarchiveObserved`, `unsnoozeObserved`
  - `apps/server/src/routers/lambda/notification.ts` — `feed` input + `unarchive`/`unsnooze` procs
  - `apps/server/src/services/workAttention/feedPage.ts` — pass-through + identifier overlay
  - `src/services/notification.ts` — service surface
- **Plane source:** `apps/api/plane/app/views/notification/base.py` list + store
  `generateNotificationQueryParams`

## Input additions (all optional, backward compatible)

```ts
{
  mentioned?: boolean;          // tab: true → mention rows only; false → exclude mentions
  types?: ('assigned'|'created'|'subscribed')[];  // funnel filters, OR'd
  unreadOnly?: boolean;         // Plane read=false overlay (combines with archived/snoozed)
}
```

## SQL semantics (copy of Plane)

- `isMention := (category = 'mention' OR type = 'mention')`
  (covers live rows `type='mention'` + legacy/seed `category='mention'`).
- `mentioned=true` → `isMention`; `mentioned=false` → `NOT isMention`; `undefined` → no constraint.
- `unreadOnly` → `(isRead = false OR (kind='action' AND resolvedAt IS NULL))`
  (same clause as `filter='unread'` minus the `isArchived=false` it already implies).
- `types` (task-resource rows only; OR across checked values):
  - `assigned` → `EXISTS(tasks.id = resourceId AND assigneeUserId = me)`
  - `created` → `EXISTS(tasks.id = resourceId AND createdByUserId = me)`
  - `subscribed` → `EXISTS(task_subscriptions taskId = resourceId AND userId = me
AND unsubscribedAt IS NULL) AND NOT (assigned-clause OR created-clause)`
    — Plane's exclusion is unconditional.
- `presentationWhere('mentions')` widened to `isMention` (fixes live mention rows that
  stamp `category='workspace'`).
- `getFeedSummary().unreadMentionCount` widened to `isMention` + same snooze window as
  `unreadBadgeCount`; `unreadOtherCount` exclusion updated to the same predicate.

## New mutations

- `unarchive(id, expectedVersion)` → `unarchiveObserved`: `isArchived=false,
archivedAt=null`, version-guarded like `archiveObserved`.
- `unsnooze(id, expectedVersion)` → `unsnoozeObserved`: `snoozedUntil=null`,
  version-guarded like `snooze`.

## Card field

- `NotificationFeedCard.resourceIdentifier?: string | null` — task `identifier`
  (e.g. `T-501`) resolved in `collectLiveTitles` (rename to live-resource overlay);
  absent for non-task resources and unresolved ids. Line-2 renders
  `{identifier} {title}`.

## Back-compat

- `filter`, `kind`, `includeSnoozed`, `cursor`, `limit` unchanged. `kind` stays accepted
  (bulk fingerprints + other consumers); the inbox page stops passing it.
- `presentationWhere('mentions')`/`getNavigationCounts` category buckets untouched —
  no projection write changes.
