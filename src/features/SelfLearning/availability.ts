/**
 * Self-evolving drafts and distils rules with the built-in harness, so its
 * pages are withheld together with that harness. `self-learning` is the legacy
 * path of the same pages.
 */
export const isSelfEvolvingPath = (pathname: string): boolean =>
  /\/agent\/[^/]+\/self-(?:evolving|learning)(?:\/|$)/.test(pathname);
