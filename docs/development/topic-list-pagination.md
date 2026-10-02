# Workspace conversation feed — cursor pagination

`topic.queryTopics` has two response shapes on the same procedure.

## Legacy callers — flat array

Pass `{ pageSize?, statuses?, withLastMessage? }` and the response is the
`TopicListItem[]` array it always was (`TopicModel.queryTopics`). Unchanged;
every existing caller keeps working.

## Paged callers — envelope

Pass `limit` and/or `cursor` and the response switches to the envelope
`{ items: TopicListItem[]; nextCursor: string | null }`
(`TopicModel.queryTopicsPage`):

- `limit` is the page size (router caps it at 50; the model fetches `limit + 1`
  internally to detect the end of the list). The mobile feed uses 30.
- `cursor` is the opaque `updatedAt|id` value a previous page returned as
  `nextCursor`; `null` means end of list. The timestamp is selected as
  `topics.updatedAt::text` so PostgreSQL microseconds survive the round-trip;
  `id` is the tiebreaker for same-timestamp rows.
- Ordering is `updatedAt DESC, id DESC`; the keyset predicate is
  `updatedAt < c OR (updatedAt = c AND id < c)`.
- A malformed/empty cursor is ignored — the call returns page one instead of
  throwing.

## Client contract

The feed hook (`useMobileTopics`, `useSWRInfinite`) asks for the next page when
the previous `nextCursor` is non-null. Because `updatedAt` moves when a
conversation receives activity, a topic bumped between two page fetches can
appear on both pages — clients MUST dedupe by `id`
(`flattenTopicPages` keeps the newest page's copy, preserving feed order).
The mobile list loads the next page when a sentinel `LazyLoad` enters the
viewport.
