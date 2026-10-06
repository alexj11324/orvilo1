# Workspace Task metadata

Workspace Tasks are shared metadata within their workspace. Legacy rows with a stored private flag are read as public without a data migration. Old clients that submit private visibility on create, update or transfer receive the canonical workspace value. Personal scope stays owner-only, and private-team membership remains an independent restriction.

The same rule applies to grouped Tasks, parent metadata, Project and Recent results, notifications, collaboration rooms, Work projections and Linear conflict context. Private execution-topic titles, non-Task Work privacy, orphan ownership and private Agent configuration/execution remain protected.

This layer depends on the execution authorization repair in PR #479. Privacy controls and filters are removed in a separate UI layer; board markers are tracked independently in PR #480.

Validation on source files frozen from `511a6c2ca37adb2e28ef9af253bc7e1d8974d4af`: 735 distinct tests passed across Task/Topic models, server Task flows, related metadata readers, rooms, Work projections and Linear conflict context. Scoped lint passed. Independent code, database and TypeScript reviews found and verified fixes for ranked-group projection and Drizzle alias types. No local type check ran; remote CI remains a separate gate.

Real HTTP acceptance is pending on the populated local fixture. It must demonstrate that a legacy private workspace row is readable as public without changing the stored flag, including grouped reads; old-client private writes canonicalize to public; foreign workspace requests and private Agent execution remain denied. The named disposable fixture and temporary membership must be restored before recording completion. Native UI screenshots are not part of this backend-only proof.
