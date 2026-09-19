export const nextInboxSelection = (
  ids: string[],
  selectedId: string | null,
  delta: -1 | 1,
): string | null => {
  if (ids.length === 0) return null;
  const index = selectedId ? ids.indexOf(selectedId) : -1;
  if (index < 0) return delta > 0 ? ids[0]! : ids.at(-1)!;
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))] ?? null;
};
