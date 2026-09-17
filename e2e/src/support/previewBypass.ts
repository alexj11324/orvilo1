import type { APIRequestContext } from 'playwright';

/** Exchange the automation header for a host-scoped cookie before navigation.
 * Never attach the reusable secret to a browser context or a followed redirect.
 */
export const bootstrapPreviewBypass = async (
  api: Pick<APIRequestContext, 'get' | 'storageState'>,
  baseUrl: string,
  secret: string | undefined,
): Promise<void> => {
  if (!secret) return;
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Preview bypass requires an HTTPS origin without URL credentials');
  }
  let response: Awaited<ReturnType<APIRequestContext['get']>> | undefined;
  try {
    response = await api.get(`${url.origin}/`, {
      failOnStatusCode: false,
      headers: {
        'x-vercel-protection-bypass': secret,
        'x-vercel-set-bypass-cookie': 'true',
      },
      maxRedirects: 0,
      timeout: 30_000,
    });
    if (response.status() < 200 || response.status() >= 400) {
      throw new Error('Preview bypass was rejected');
    }
    const cookieNames = new Set(
      response.headersArray()
        .filter(({ name }) => name.toLowerCase() === 'set-cookie')
        .map(({ value }) => value.slice(0, value.indexOf('='))),
    );
    const { cookies } = await api.storageState();
    if (!cookies.some((cookie) => cookieNames.has(cookie.name) && cookie.secure &&
      cookie.domain.replace(/^\./, '') === url.hostname)) {
      throw new Error('Preview bypass did not establish a host-scoped cookie');
    }
  } catch {
    // Playwright errors can contain request headers; never expose the original.
    throw new Error('Preview bypass bootstrap failed; no browser navigation was attempted');
  } finally {
    await response?.dispose().catch(() => undefined);
  }
};
