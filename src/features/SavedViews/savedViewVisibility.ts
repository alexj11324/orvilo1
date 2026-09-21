export type SavedViewVisibilityValue = 'private' | 'team' | 'workspace';

const VISIBILITY_KEYS = {
  private: 'savedViews.visibilityPrivate',
  team: 'savedViews.visibilityTeam',
  workspace: 'savedViews.visibilityWorkspace',
} as const satisfies Record<SavedViewVisibilityValue, string>;

// Shared label resolver for every surface that displays a saved view's
// sharing scope (directory table, team views list, share dialog). Unknown
// values must not silently render as a public scope.
export const savedViewVisibilityKey = (visibility?: string | null) =>
  visibility && visibility in VISIBILITY_KEYS
    ? VISIBILITY_KEYS[visibility as SavedViewVisibilityValue]
    : ('savedViews.visibilityUnknown' as const);
