import type { CSSProperties } from 'react';

/**
 * Linear sizes a list's identifier column to its longest identifier, so every
 * row's status mark sits at the same x (`DAY123-79` and `ORV-117` rows share
 * one column). The list sets this variable once; each row's identifier reads
 * it as a min-width.
 */
export const ISSUE_ID_WIDTH_VAR = '--issue-id-width';

/** Style for a list root: an identifier column as wide as its longest id. */
export const issueIdColumnStyle = (
  identifiers: Iterable<null | string | undefined>,
): CSSProperties | undefined => {
  let longest = 0;
  for (const identifier of identifiers) {
    if (identifier && identifier.length > longest) longest = identifier.length;
  }
  if (longest === 0) return undefined;
  // `ch` is the digit advance; identifiers render with tabular numerals, and
  // their uppercase prefixes run close to it at 13px.
  return { [ISSUE_ID_WIDTH_VAR]: `${longest}ch` } as CSSProperties;
};
