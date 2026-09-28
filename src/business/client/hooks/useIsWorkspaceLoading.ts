import { useFetchWorkspaces } from './useFetchWorkspaces';

/**
 * True while the first `workspace.list` request is genuinely in flight.
 *
 * A terminal failure is NOT loading: callers that need to gate a `/{slug}`
 * first paint must branch on `error` themselves (e.g. render a retry surface)
 * instead of spinning forever. Read `error` from `useFetchWorkspaces` — a
 * cold failure with no data must still not be mistaken for "resolved empty",
 * so scope-changing consumers gate on `data === undefined`, not on this flag.
 */
export const useIsWorkspaceLoading = (): boolean => {
  const { isLoading } = useFetchWorkspaces();
  return isLoading;
};
