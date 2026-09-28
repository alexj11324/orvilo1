const BROKER_ORIGIN = 'https://accounts.aspectlylabs.com';
const PRODUCT_ORIGIN = 'https://orvilo.aspectlylabs.com';

export const DEFAULT_ACCOUNTS_RETURN_URL = new URL('/', PRODUCT_ORIGIN).href;

function relativeReturnUrl(raw: string): string | null {
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return null;
  }

  try {
    const url = new URL(raw, BROKER_ORIGIN);
    if (url.origin !== BROKER_ORIGIN || url.username || url.password) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Keep browser returns inside the portal or its server-validated product origin. */
export const resolveAccountsReturnUrl = (
  raw: string | null | undefined,
  productOrigin: string = PRODUCT_ORIGIN,
): string => {
  const defaultReturnUrl = new URL('/', productOrigin).href;
  const value = raw?.trim() ?? '';
  if (!value) return defaultReturnUrl;

  const relative = relativeReturnUrl(value);
  if (relative) return relative;

  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.origin === productOrigin &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    // Invalid values use the product login destination below.
  }

  return defaultReturnUrl;
};

/** Standalone portal login must leave for the product, not loop back to itself. */
export const resolveStandaloneReturnUrl = (
  raw: string | null | undefined,
  productOrigin: string = PRODUCT_ORIGIN,
): string => {
  const resolved = resolveAccountsReturnUrl(raw, productOrigin);
  return resolved.startsWith('/') ? new URL('/', productOrigin).href : resolved;
};
