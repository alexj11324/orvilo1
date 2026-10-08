# Project update drafts and activity typography

The project update composer keeps unsent text, health and mode in the shared composer draft store (`src/features/ChatInput/draftStorage.ts`). Drafts are keyed by user, project and target: the new-update composer or the posted row being edited. A stored draft restores on the next mount, clears when the body becomes blank and clears after a successful post or save. Stored values are validated before use, and a posted row keeps its kind regardless of the draft. Key, restore and persist rules live in `src/features/Projects/Updates/projectUpdateDraft.ts`.

The update editor ignores change events that arrive after it unmounts, so the editor's trailing change after a successful post cannot write the posted text back as a draft.

The update editor and project activity sentences use 14px body copy on a 22px line. Activity timestamps stay at 12px.
