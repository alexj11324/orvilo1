/** Team placements are visible to readers, so a private page cannot be offered for attachment. */
export const isPublicDocument = (document: { visibility: string }): boolean =>
  document.visibility === 'public';
