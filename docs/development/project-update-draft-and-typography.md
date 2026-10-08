# Project update drafts and activity typography

The project update composer keeps unsent text, health and mode in the shared composer draft store (`src/features/ChatInput/draftStorage.ts`). Key, restore and persist rules live in `src/features/Projects/Updates/projectUpdateDraft.ts`.

Drafts are keyed by signed-in user, active workspace (personal mode is its own scope), project and target: the new-update composer or the posted row being edited. Without a signed-in user there is no key, and nothing is read or written. Another account or workspace on the same device never restores the draft.

A draft is stored only while it differs from the saved record. Opening a posted row stores nothing until its body or health changes, and returning to the saved content clears the draft. A blank body clears it. Cancelling an edit, saving an edit and posting a new update clear it, and nothing is stored after an edit is cancelled or saved. Stored values are validated before use, and a posted row keeps its kind regardless of the draft.

The composer mounts once per draft key and remounts when the user, workspace, project or edited row changes, so state typed under one scope is never written under another. The update editor ignores change events that arrive after it unmounts, so a trailing change after a post or a scope change cannot write a draft.

The update editor and project activity sentences use 14px body copy on a 22px line. Activity timestamps stay at 12px.
