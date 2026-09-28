const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Return only a Lexical document; older drafts may store it without the v1 wrapper. */
export const draftPreviewDocument = (stored: unknown): Record<string, unknown> | null => {
  const wrapped = isRecord(stored) && stored.version === 1 ? stored.document : stored;
  let document = wrapped;
  if (typeof document === 'string') {
    try {
      document = JSON.parse(document);
    } catch {
      return null;
    }
  }
  return isRecord(document) && isRecord(document.root) ? document : null;
};
