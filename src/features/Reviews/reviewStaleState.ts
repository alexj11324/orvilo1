export type ReviewStaleState = Readonly<Record<string, boolean>>;

export const reviewStaleKey = (workspaceId: string | null | undefined, reviewId: string): string =>
  `${workspaceId ?? ''}:${reviewId}`;

export const reviewStaleState = (key: string, stale: boolean): ReviewStaleState => ({
  [key]: stale,
});

/** An older request may settle after navigation; only its own review entry changes. */
export const updateReviewStaleState = (
  state: ReviewStaleState,
  key: string,
  stale: boolean,
): ReviewStaleState => ({ ...state, [key]: stale });

/** A stale observation belongs only to the review identity that produced it. */
export const isReviewStale = (state: ReviewStaleState, key: string): boolean => state[key] === true;
