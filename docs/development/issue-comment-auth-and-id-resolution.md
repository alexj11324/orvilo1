# Issue comment authorship and resource IDs

Follow-up to #599 and #607.

Interactive comment edits and deletions belong only to the comment author. Workspace
Owner and Admin roles do not grant an exception. An Agent actor is distinct from its
user owner: it may mutate only comments attributed to that exact Agent. The router
uses the existing trusted `actingAgentId`, or the existing Agent Use check for the
client runtime's claimed actor. It does not accept an unchecked principal.

The model checks the visible comment under a transaction row lock and includes the
author predicate in the final write. Visible non-author mutations return `FORBIDDEN`;
out-of-scope comments retain the existing not-found behavior. Linear's controlled
managed-subject reconciliation remains separate from interactive authorship.

Comment activity includes optional ISO `updatedAt`. A failed refresh after a successful
comment save does not report the save as failed or encourage a duplicate submission.

Issue resources use the exact database ID for reads, writes, removals and caches.
`TaskModel.resolve` retains its `task_` fast path and case-insensitive identifier lookup,
and checks other exact database IDs in the same visibility scope before identifier
lookup. This avoids addressing another row when identifiers are shared.

Normal TaskModel creation, including the current Linear import path, uses generated
`task_` IDs. The database primary key is text and permits legacy or seeded IDs with
other shapes. This change supports those persisted IDs; production historical ID
distribution was not queried, and no existing data is migrated.

Verification uses the existing database, router, service and store suites. Product
acceptance must include two real workspace actors attempting each other's comment
mutations, an Agent's own and non-owned comments, exact-row resource operations and
comment persistence after a refresh error. Unit and integration tests do not replace
that product acceptance.
