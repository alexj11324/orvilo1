import { SOCIAL_URL } from '@orvilo/business-const';

/**
 * The X account this deployment owns, as a `twitter:site` handle.
 *
 * Derived from the configured account rather than from the brand name: `@<Brand>`
 * advertises a handle that may not exist, and falling back to the upstream
 * handle advertises someone else's account. These tags are emitted per page, so
 * getting this wrong puts the wrong account on every share card.
 *
 * `undefined` means this deployment has no X account — callers must omit the tag
 * entirely rather than emit an empty one.
 *
 * This lives in its own module rather than in `url.ts` on purpose: it reads
 * `SOCIAL_URL` while the module is evaluated, and `url.ts` is imported by
 * hundreds of files. Putting it there would make every one of those imports
 * depend on `@orvilo/business-const`, so any test that partially mocks that
 * module would blow up on an import it never asked for.
 */
export const TWITTER_SITE: string | undefined = (() => {
  if (!SOCIAL_URL.x) return undefined;

  const handle = new URL(SOCIAL_URL.x).pathname.split('/').findLast(Boolean);

  return handle ? `@${handle}` : undefined;
})();
