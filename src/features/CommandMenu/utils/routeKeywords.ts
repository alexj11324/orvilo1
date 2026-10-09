/** Search aliases for a route whose stable CMDK value differs from its visible label. */
export const routeSearchKeywords = (label: string, aliases: string[] = []): string[] => [
  label,
  ...aliases,
];
