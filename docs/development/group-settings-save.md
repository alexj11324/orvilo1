# Group settings save

The coordinator and opening drafts live in the settings page, so Save persists every tab that has edits, not only the visible one. `groupSettingsDirty.ts` compares each draft with the stored coordinator and group config. If the coordinator has edits that are not valid yet, Save from another tab does nothing and says so instead of reporting success.
