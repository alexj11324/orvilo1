# Task privacy controls

Workspace Tasks have no private visibility choice. This UI layer removes the create-form chip and privacy state, list filters, detail publish/private actions and privacy-based member restrictions. Saved old private drafts keep their text, priority and assignees while their obsolete visibility is ignored. Workspace create requests send public; personal scope leaves visibility unspecified and has no member directory. Member-role and edit-permission checks remain active.

This follows backend PR #481, which canonicalizes legacy rows and old-client payloads while preserving scope, team and execution restrictions. Board marker changes and collaboration metadata for cards are a separate three-file PR #480. This layer contains 18 source/test files, without duplicating the Board changes.

The 18 delivered files match the frozen files tested and reviewed on local candidate `6818b5c0fae2a08030965ee6bd54080282aa2cca`: 179 focused tests passed and scoped lint was clean. Independent code and TypeScript review found no UI blockers. Backend HTTP proof on that candidate is recorded in [workspace Task metadata](./workspace-task-metadata.md); it proves API behavior and does not prove form interactions.

Native UI acceptance remains pending because the computer-use service repeatedly returned ScreenCaptureKit error `-3812` while reading the isolated Electron window. Before this draft is ready, verify the modal and inline forms with preserved drafts, real member selection, create/reopen persistence, and the absent privacy filter/detail actions. Keep the user's open form intact until the window can be observed. Light/narrow sidebar checks remain with PR #478.
