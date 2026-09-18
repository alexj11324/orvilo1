import type { RemovalPreview } from '../api/contract';

/**
 * Whether the remove button may commit. The preview is the only evidence the
 * user saw what removing this member disturbs — while it is loading, failed,
 * or absent, or while a removal is already in flight, the destructive action
 * stays disabled rather than letting a blind click through.
 */
export const removalArmed = (args: {
  error: unknown;
  isLoading: boolean;
  mutating: boolean;
  preview: RemovalPreview | undefined;
}): boolean => !args.isLoading && !args.mutating && !args.error && !!args.preview;
