export type TeamSurfaceState = 'empty' | 'error' | 'loading' | 'ready';

/**
 * Failed fetches must not render as "nothing here". Keep stale rows when we
 * already have them; only the zero-item path distinguishes error / loading /
 * empty.
 */
export const teamSurfaceState = (input: {
  error: unknown;
  isLoading: boolean;
  itemCount: number;
}): TeamSurfaceState => {
  if (input.itemCount > 0) return 'ready';
  if (input.error) return 'error';
  if (input.isLoading) return 'loading';
  return 'empty';
};
