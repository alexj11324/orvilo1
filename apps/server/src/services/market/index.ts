import { MarketSDK } from '@lobehub/market-sdk';
import debug from 'debug';

import type { TrustedClientUserInfo } from '@/libs/trusted-client';
import { generateTrustedClientToken } from '@/libs/trusted-client';

import { assertMarketConfigured } from './availability';

const log = debug('orvilo-server:market-service');
const MARKET_BASE_URL = process.env.MARKET_BASE_URL || 'https://market.aspectlylabs.com';

export interface MarketServiceOptions {
  /** Access token from OIDC flow (user token) */
  accessToken?: string;
  /** Client credentials for M2M authentication */
  clientCredentials?: {
    clientId: string;
    clientSecret: string;
  };
  /**
   * Owner account id for organization-scoped operations.
   *
   * When set, Market attributes reads/writes (currently: creds and inject-creds)
   * to the given organization account instead of the actor's personal account.
   * Used by the workspace creds router after resolving a cloud workspace to
   * its Market organization via {@link WorkspaceMarketIdentityService}.
   */
  ownerAccountId?: number;
  /** Pre-generated trusted client token (alternative to userInfo) */
  trustedClientToken?: string;
  /** User info for generating trusted client token */
  userInfo?: TrustedClientUserInfo;
}

/** Existing explicit cloud execution and artifact transport; no catalog or MCP management. */
export class MarketService {
  private readonly marketClient: MarketSDK;

  get market(): MarketSDK {
    assertMarketConfigured();
    return this.marketClient;
  }

  constructor(options: MarketServiceOptions = {}) {
    const { accessToken, userInfo, clientCredentials, trustedClientToken, ownerAccountId } =
      options;

    // Use provided trustedClientToken or generate from userInfo
    const resolvedTrustedClientToken =
      trustedClientToken || (userInfo ? generateTrustedClientToken(userInfo) : undefined);

    this.marketClient = new MarketSDK({
      accessToken,
      baseURL: MARKET_BASE_URL,
      clientId: clientCredentials?.clientId,
      clientSecret: clientCredentials?.clientSecret,
      ownerAccountId,
      trustedClientToken: resolvedTrustedClientToken,
    });

    log(
      'MarketService initialized: baseURL=%s, hasAccessToken=%s, hasTrustedToken=%s, hasClientCredentials=%s, ownerAccountId=%s',
      MARKET_BASE_URL,
      !!accessToken,
      !!resolvedTrustedClientToken,
      !!clientCredentials,
      ownerAccountId ?? 'none',
    );
  }

  async exportFile(params: { path: string; topicId: string; uploadUrl: string; userId: string }) {
    const { path, uploadUrl, topicId, userId } = params;

    return this.market.plugins.runBuildInTool(
      'exportFile',
      { path, uploadUrl },
      { topicId, userId },
    );
  }

  getSDK(): MarketSDK {
    return this.market;
  }
}
