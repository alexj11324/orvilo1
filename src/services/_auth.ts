import { CLIENT_VERSION_HEADER, CURRENT_VERSION } from '@orvilo/const';

interface AuthParams {
  headers?: HeadersInit;
  /**
   * @deprecated Accepted for call-site compatibility only. Per-provider
   * keyVault injection was removed together with BYOK provider management —
   * provider credentials resolve on the server now.
   */
  provider?: string;
}

export const createHeaderWithAuth = async (params?: AuthParams): Promise<HeadersInit> => {
  const headers = new Headers(params?.headers);
  headers.set(CLIENT_VERSION_HEADER, CURRENT_VERSION);

  return Object.fromEntries(headers.entries());
};
