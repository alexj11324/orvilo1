/** undefined means no tail has loaded; null means the server exhausted it. */
export const activityFeedCursor = (
  firstCursor: string | null | undefined,
  tailCursor: string | null | undefined,
) => (tailCursor === undefined ? firstCursor : tailCursor) ?? undefined;

export const activityFeedRows = <T extends { id: string }>(first: T[], tail: T[]): T[] => {
  const seen = new Set<string>();
  return [...first, ...tail].filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};
