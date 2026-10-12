/** The title a rename would save, or undefined when there is nothing to save. */
export const resolveResourceTitleChange = (current: string, draft: string): string | undefined => {
  const next = draft.trim();
  return next && next !== current ? next : undefined;
};
