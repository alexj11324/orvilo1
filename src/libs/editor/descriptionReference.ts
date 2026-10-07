import { safeWorkAttentionActionUrl } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';

export interface DescriptionReference {
  id: string;
  kind: 'issue' | 'pull-request';
  url: string;
}

export const DESCRIPTION_REFERENCE_SCHEMA = 'orvilo-description-reference';
const ISSUE_REFERENCE_PATH = /^(?:\/([^/]+))?(?:\/agent\/[^/]+)?\/task\/([\w-]+)(?:\/[^/]+)?\/?$/;

/** Recognize existing app/GitHub routes; never fetch a supplied URL. */
export const parseDescriptionReference = (
  raw: string,
  appOrigin: string,
): DescriptionReference | null => {
  try {
    const origin = new URL(appOrigin);
    if (origin.protocol !== 'https:' && origin.protocol !== 'http:') return null;
    const trimmed = raw.trim();
    // Apply the shared relative-path guard to absolute same-app links as well.
    const candidate = trimmed.startsWith(`${origin.origin}/`)
      ? trimmed.slice(origin.origin.length)
      : trimmed;
    const safe = safeWorkAttentionActionUrl(candidate);
    if (!safe) return null;
    const url = new URL(safe, origin.origin);

    if (url.hostname === 'github.com' && url.protocol === 'https:' && !url.port) {
      const match =
        /^\/([\w-]+)\/([\w.-]+)\/pull\/([1-9]\d*)(?:\/(?:files|commits|checks))?\/?$/.exec(
          url.pathname,
        );
      if (!match || !Number.isSafeInteger(Number(match[3]))) return null;
      const [, owner, repo, number] = match;
      return {
        id: `gh:github.com:${owner}:${repo}:${number}`,
        kind: 'pull-request',
        url: `https://github.com/${owner}/${repo}/pull/${number}`,
      };
    }

    if (url.origin !== origin.origin) return null;
    const match = ISSUE_REFERENCE_PATH.exec(url.pathname);
    if (!match) return null;
    return { id: match[2], kind: 'issue', url: `${origin.origin}${url.pathname}` };
  } catch {
    return null;
  }
};

export const descriptionReferenceWorkspaceSlug = (reference: DescriptionReference) =>
  reference.kind === 'issue'
    ? ISSUE_REFERENCE_PATH.exec(new URL(reference.url).pathname)?.[1]
    : undefined;

export const validateDescriptionReferenceNode = (value: unknown, appOrigin: string) => {
  if (
    !isRecord(value) ||
    value.schemaType !== DESCRIPTION_REFERENCE_SCHEMA ||
    typeof value.url !== 'string'
  )
    return null;
  const payload = validateDescriptionReference(value.payload, appOrigin);
  const target = parseDescriptionReference(value.url, appOrigin);
  return payload &&
    target?.id === payload.id &&
    target.kind === payload.kind &&
    target.url === payload.url
    ? payload
    : null;
};

/** Imported JSON/HTML cannot change which resource the displayed URL resolves. */
export const validateDescriptionReference = (
  value: unknown,
  appOrigin: string,
): DescriptionReference | null => {
  if (!isRecord(value) || typeof value.url !== 'string') return null;
  const reference = parseDescriptionReference(value.url, appOrigin);
  return reference?.id === value.id && reference.kind === value.kind ? reference : null;
};
