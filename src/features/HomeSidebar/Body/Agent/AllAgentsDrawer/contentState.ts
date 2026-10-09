export type AllAgentsContentState = 'empty' | 'error' | 'list' | 'loading';

interface ResolveAllAgentsContentStateParams {
  count: number;
  hasSearchResults: boolean;
  isSearching: boolean;
  isSearchLoading: boolean;
  searchError?: unknown;
}

export const resolveAllAgentsContentState = ({
  count,
  hasSearchResults,
  isSearchLoading,
  isSearching,
  searchError,
}: ResolveAllAgentsContentStateParams): AllAgentsContentState => {
  // Before the loading gate: a failed search has no results, so it would
  // otherwise read as "still loading" forever.
  if (isSearching && searchError) return 'error';
  if (isSearching && (isSearchLoading || !hasSearchResults)) return 'loading';
  if (count === 0) return 'empty';
  return 'list';
};
