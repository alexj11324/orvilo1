import { type MarketSDK } from '@lobehub/market-sdk';
import { type CallReportRequest } from '@lobehub/market-types';
import {
  COMPOSIO_APP_TYPES,
  CURRENT_VERSION,
  DEFAULT_DISCOVER_ASSISTANT_ITEM,
  DEFAULT_DISCOVER_PLUGIN_ITEM,
  discoverUrl,
  isDesktop,
  OFFICIAL_SITE,
} from '@orvilo/const';
import {
  type AgentStatus,
  type AssistantListResponse,
  type AssistantMarketSource,
  type AssistantQueryParams,
  type DiscoverAssistantDetail,
  type DiscoverAssistantItem,
  type DiscoverMcpDetail,
  type DiscoverPluginDetail,
  type DiscoverPluginItem,
  type McpListResponse,
  type McpQueryParams,
  type PluginListResponse,
  type PluginQueryParams,
} from '@orvilo/types';
import {
  AssistantCategory,
  AssistantSorts,
  CacheRevalidate,
  CacheTag,
  McpCategory,
  McpSorts,
} from '@orvilo/types';
import dayjs from 'dayjs';
import debug from 'debug';
import { cloneDeep, isString, merge } from 'es-toolkit/compat';

import { type TrustedClientUserInfo } from '@/libs/trusted-client';
import { normalizeLocale } from '@/locales/resources';
import { AssistantStore } from '@/server/modules/AssistantStore';
import { PluginStore } from '@/server/modules/PluginStore';
import { MarketService } from '@/server/services/market';

const log = debug('orvilo-server:discover');

export interface DiscoverServiceOptions {
  /** Access token from OIDC flow (legacy) */
  accessToken?: string;
  /** User info for generating trusted client token */
  userInfo?: TrustedClientUserInfo;
}

export class DiscoverService {
  assistantStore = new AssistantStore();
  pluginStore = new PluginStore();
  market: MarketSDK;

  constructor(options: DiscoverServiceOptions = {}) {
    const { accessToken, userInfo } = options;

    // Use MarketService to initialize MarketSDK
    const marketService = new MarketService({ accessToken, userInfo });
    this.market = marketService.market;

    log(
      'DiscoverService initialized with market baseURL: %s, hasAuth: %s, userId: %s',
      process.env.MARKET_BASE_URL,
      !!(accessToken || userInfo),
      userInfo?.userId,
    );
  }

  async registerClient({ userAgent }: { userAgent?: string }) {
    const getDeviceId = async (): Promise<string> => {
      // 1. Use VERCEL_PROJECT_ID in Vercel environment
      if (process.env.VERCEL_PROJECT_ID) {
        return process.env.VERCEL_PROJECT_ID;
      }

      // 2. Use machine-id for desktop
      if (isDesktop) {
        try {
          // Dynamic import
          const { machineId } = await import('node-machine-id');
          return await machineId();
        } catch (error) {
          console.error('Failed to get machine-id:', error);
        }
      }

      return 'unknown-device';
    };

    const deviceId = await getDeviceId();

    const { client_id, client_secret } = await this.market.registerClient({
      clientName: `Orvilo ${isDesktop ? 'Desktop' : 'Web'}`,
      clientType: isDesktop ? 'desktop' : 'web',
      deviceId,
      platform: isDesktop ? process.platform : userAgent,
      version: CURRENT_VERSION,
    });

    return { clientId: client_id, clientSecret: client_secret };
  }

  async fetchM2MToken(params: { clientId: string; clientSecret: string }) {
    // Use MarketService with M2M credentials
    const marketService = new MarketService({
      clientCredentials: params,
    });

    const tokenInfo = await marketService.fetchM2MToken();

    return {
      accessToken: tokenInfo.accessToken,
      expiresIn: tokenInfo.expiresIn,
    };
  }

  // ============================== Call Cloud Mcp Endpoint Methods ==============================

  async callCloudMcpEndpoint(params: {
    apiParams: Record<string, any>;
    identifier: string;
    toolName: string;
    userAccessToken?: string;
  }) {
    log('callCloudMcpEndpoint: params=%O', {
      apiParams: params.apiParams,
      hasUserAccessToken: !!params.userAccessToken,
      identifier: params.identifier,
      toolName: params.toolName,
    });

    try {
      // Build headers - only include Authorization if userAccessToken is provided
      // When userAccessToken is not provided, MarketSDK will use trustedClientToken for authentication
      const headers: Record<string, string> = {};
      if (params.userAccessToken) {
        headers.Authorization = `Bearer ${params.userAccessToken}`;
      }

      // Call cloud gateway with optional user access token in Authorization header
      const result = await this.market.plugins.callCloudGateway(
        {
          apiParams: params.apiParams,
          identifier: params.identifier,
          toolName: params.toolName,
        },
        {
          headers,
        },
      );

      log('callCloudMcpEndpoint: success, result=%O', result);
      return result;
    } catch (error) {
      log('callCloudMcpEndpoint: error=%O', error);
      throw error;
    }
  }

  // ============================== Helper Methods ==============================

  private normalizeAuthorField = (
    author: unknown,
  ): { name: string; ownerType?: 'user' | 'organization'; userName?: string } => {
    if (!author) return { name: '' };

    if (typeof author === 'string') return { name: author };

    if (typeof author === 'object') {
      const { avatar, url, name, userName, type } = author as {
        avatar?: unknown;
        name?: unknown;
        type?: unknown;
        url?: unknown;
        userName?: unknown;
      };

      const authorName =
        (typeof name === 'string' && name.length > 0 && name) ||
        (typeof avatar === 'string' && avatar.length > 0 && avatar) ||
        (typeof url === 'string' && url.length > 0 && url) ||
        '';

      return {
        name: authorName,
        ownerType: type === 'organization' ? 'organization' : 'user',
        userName: typeof userName === 'string' ? userName : undefined,
      };
    }

    return { name: '' };
  };

  private isLegacySource = (source?: AssistantMarketSource) => source === 'legacy';

  private legacyGetAssistantListRaw = async (locale?: string): Promise<DiscoverAssistantItem[]> => {
    log('legacyGetAssistantListRaw: locale=%s', locale);
    const normalizedLocale = normalizeLocale(locale);
    const list = await this.assistantStore.getAgentIndex(normalizedLocale);
    if (!list || !Array.isArray(list)) {
      log('legacyGetAssistantListRaw: no valid list found, returning empty array');
      return [];
    }
    const result = list.map(({ meta, ...item }) => ({ ...item, ...meta }));
    log('legacyGetAssistantListRaw: returning %d items', result.length);
    return result;
  };

  private legacyGetAssistantDetail = async (params: {
    identifier: string;
    locale?: string;
    version?: string;
  }): Promise<DiscoverAssistantDetail | undefined> => {
    log('legacyGetAssistantDetail: params=%O', params);
    const { locale, identifier } = params;
    const normalizedLocale = normalizeLocale(locale);
    const data = await this.assistantStore.getAgent(identifier, normalizedLocale);
    if (!data) {
      log('legacyGetAssistantDetail: assistant not found for identifier=%s', identifier);
      return;
    }
    const { meta, ...item } = data;
    const assistant = merge(cloneDeep(DEFAULT_DISCOVER_ASSISTANT_ITEM), { ...item, ...meta });
    const list = await this.getAssistantList({
      category: assistant.category,
      includeAgentGroup: true,
      locale,
      page: 1,
      pageSize: 7,
      source: 'legacy',
    });
    const result = {
      ...assistant,
      related: list.items.filter((item) => item.identifier !== assistant.identifier).slice(0, 6),
    };
    log(
      'legacyGetAssistantDetail: returning assistant with %d related items',
      result.related.length,
    );
    return result;
  };

  private legacyGetAssistantList = async (
    params: AssistantQueryParams = {},
  ): Promise<AssistantListResponse> => {
    log('legacyGetAssistantList: params=%O', params);
    const {
      locale,
      category,
      order = 'desc',
      page = 1,
      pageSize = 20,
      q,
      sort = AssistantSorts.Recommended,
      ownerId,
    } = params;
    const currentPage = Number(page) || 1;
    const currentPageSize = Number(pageSize) || 20;

    if (ownerId) {
      log('legacyGetAssistantList: ownerId filter not supported in legacy source');
      return {
        currentPage,
        items: [],
        pageSize: currentPageSize,
        totalCount: 0,
        totalPages: 0,
      };
    }

    let list = await this.legacyGetAssistantListRaw(locale);
    const originalCount = list.length;

    if (category) {
      list = list.filter((item) => item.category === category);
      log(
        'legacyGetAssistantList: filtered by category "%s", %d -> %d items',
        category,
        originalCount,
        list.length,
      );
    }

    if (q) {
      const beforeFilter = list.length;
      list = list.filter((item) => {
        return [item.author, item.title, item.description, item?.tags]
          .flat()
          .filter(Boolean)
          .join(',')
          .toLowerCase()
          .includes(decodeURIComponent(q).toLowerCase());
      });
      log(
        'legacyGetAssistantList: filtered by query "%s", %d -> %d items',
        q,
        beforeFilter,
        list.length,
      );
    }

    if (sort) {
      log('legacyGetAssistantList: sorting by %s %s', sort, order);
      switch (sort) {
        case AssistantSorts.UpdatedAt: {
          // Legacy source doesn't have updatedAt, fallback to createdAt
          list = list.sort((a, b) => {
            if (order === 'asc') {
              return dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix();
            } else {
              return dayjs(b.createdAt).unix() - dayjs(a.createdAt).unix();
            }
          });
          break;
        }
        default: {
          // Legacy source doesn't support these sorts (MostUsage, HaveSkills, Recommended), keep original order
          break;
        }
      }
    }

    const start = (currentPage - 1) * currentPageSize;
    const end = currentPage * currentPageSize;
    const result = {
      currentPage,
      items: list.slice(start, end),
      pageSize: currentPageSize,
      totalCount: list.length,
      totalPages: Math.ceil(list.length / currentPageSize),
    };
    log(
      'legacyGetAssistantList: returning page %d/%d with %d items',
      currentPage,
      result.totalPages,
      result.items.length,
    );
    return result;
  };

  // ============================== Assistant Market ==============================

  getAssistantDetail = async (params: {
    identifier: string;
    locale?: string;
    source?: AssistantMarketSource;
    version?: string;
  }): Promise<DiscoverAssistantDetail | undefined> => {
    log('getAssistantDetail: params=%O', params);
    const { source, ...rest } = params;
    if (this.isLegacySource(source)) {
      return this.legacyGetAssistantDetail(rest);
    }

    const { locale, identifier, version } = rest;
    const normalizedLocale = normalizeLocale(locale);

    try {
      // @ts-ignore
      const data = await this.market.agents.getAgentDetail(identifier, {
        locale: normalizedLocale,
        version,
      });

      if (!data) {
        log('getAssistantDetail: assistant not found for identifier=%s', identifier);
        return;
      }

      const normalizedAuthor = this.normalizeAuthorField(data.author);
      const assistant = {
        author:
          normalizedAuthor.name || (data.ownerId !== null ? `User${data.ownerId}` : 'Unknown'),
        avatar: data.avatar || normalizedAuthor.name || '',
        category: (data as any).category || 'general',
        config: data.config || {},
        createdAt: (data as any).createdAt,
        currentVersion: data.version,
        description: (data as any).description || data.summary,
        // @ts-ignore
        editorData: data.editorData || {},

        examples: Array.isArray((data as any).examples)
          ? (data as any).examples.map((example: any) => ({
              content: typeof example === 'string' ? example : example.content || '',
              role: example.role || 'user',
            }))
          : [],
        forkCount: (data as any).forkCount,
        forkedFromAgentId: (data as any).forkedFromAgentId,
        homepage: (data as any).homepage || discoverUrl('assistant', (data as any).identifier),
        identifier: (data as any).identifier,
        isValidated: (data as any).isValidated,
        knowledgeCount:
          (data.config as any)?.knowledgeBases?.length || (data as any).knowledgeCount || 0,
        pluginCount: (data.config as any)?.plugins?.length || (data as any).pluginCount || 0,
        readme: data.documentationUrl || '',
        schemaVersion: 1,
        ownerType: normalizedAuthor.ownerType,
        status: (data.status as AgentStatus) || undefined,
        summary: data.summary || '',
        systemRole: (data.config as any)?.systemRole || '',
        tags: data.tags || [],
        title: (data as any).name || (data as any).identifier,
        tokenUsage: data.tokenUsage || 0,
        userName: normalizedAuthor.userName,
        versions:
          // @ts-ignore
          data.versions?.map((item) => ({
            createdAt: (item as any).createdAt || item.updatedAt,
            isLatest: item.isLatest,
            isValidated: item.isValidated,
            status: item.status as any,
            version: item.version,
          })) || [],
      };

      // Get related assistants
      const list = await this.getAssistantList({
        category: assistant.category,
        includeAgentGroup: true,
        locale,
        page: 1,
        pageSize: 7,
        source,
      });

      const result = {
        ...assistant,
        related: list.items.filter((item) => item.identifier !== assistant.identifier).slice(0, 6),
      };

      log('getAssistantDetail: returning assistant with %d related items', result.related.length);
      return result;
    } catch (error) {
      log('getAssistantDetail: error fetching from market SDK: %O', error);
      return;
    }
  };

  getAssistantList = async (
    params: AssistantQueryParams = {},
    options: { throwOnError?: boolean } = {},
  ): Promise<AssistantListResponse> => {
    log('getAssistantList: params=%O', params);
    const { source, ...rest } = params;
    if (this.isLegacySource(source)) {
      return this.legacyGetAssistantList(rest);
    }

    const {
      locale,
      category,
      order = 'desc',
      page = 1,
      pageSize = 20,
      q,
      sort = AssistantSorts.Recommended,
      ownerId,
      includeAgentGroup,
      includeCategoryCounts,
    } = rest;
    const shouldOmitCategory = [AssistantCategory.All, AssistantCategory.Discover].includes(
      category as AssistantCategory,
    );

    try {
      const normalizedLocale = normalizeLocale(locale);

      let apiSort: 'createdAt' | 'updatedAt' | 'name' | 'mostUsage' | 'recommended' = 'recommended';
      let haveSkills: boolean | undefined = rest.haveSkills;

      switch (sort) {
        case AssistantSorts.UpdatedAt: {
          apiSort = 'updatedAt';
          break;
        }
        case AssistantSorts.MostUsage: {
          apiSort = 'mostUsage';
          break;
        }
        case AssistantSorts.HaveSkills: {
          // When user selects "Skilled", set haveSkills=true and use recommended sort
          haveSkills = true;
          apiSort = 'updatedAt';
          break;
        }
        case AssistantSorts.Recommended: {
          apiSort = 'recommended';
          break;
        }
        default: {
          apiSort = 'recommended';
        }
      }

      const data = await this.market.agents.getAgentList({
        category: shouldOmitCategory ? undefined : category,
        haveSkills,
        // includeAgentGroup may not be in SDK type definition yet, using 'as any'
        includeAgentGroup,
        includeCategoryCounts,
        locale: normalizedLocale,
        order,
        ownerId,
        page,
        pageSize,
        q,
        sort: apiSort,
        status: 'published',
        visibility: 'public',
      } as any);

      const transformedItems: DiscoverAssistantItem[] = (data.items || []).map((item: any) => {
        const normalizedAuthor = this.normalizeAuthorField(item.author);
        return {
          author:
            normalizedAuthor.name || (item.ownerId !== null ? `User${item.ownerId}` : 'Unknown'),
          avatar: item.avatar || normalizedAuthor.name || '',
          category: item.category || 'general',
          config: item.config || {},
          createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
          description: item.description || item.summary || '',
          forkCount: item.forkCount,
          homepage: item.homepage || discoverUrl('assistant', item.identifier),
          identifier: item.identifier,
          installCount: item.installCount,
          knowledgeCount: item.knowledgeCount ?? item.config?.knowledgeBases?.length ?? 0,
          pluginCount: item.pluginCount ?? item.config?.plugins?.length ?? 0,
          schemaVersion: item.schemaVersion ?? 1,
          tags: item.tags || [],
          title: item.name || item.identifier,
          tokenUsage: item.tokenUsage || 0,
          type: item.type,
          updatedAt: item.updatedAt,
          userName: normalizedAuthor.userName,
        };
      });

      const result: AssistantListResponse = {
        ...((data as any).categoryCounts ? { categoryCounts: (data as any).categoryCounts } : {}),
        currentPage: data.currentPage || page,
        items: transformedItems,
        pageSize: data.pageSize || pageSize,
        totalCount: data.totalCount || 0,
        totalPages: data.totalPages || 0,
      };

      log(
        'getAssistantList: returning page %d/%d with %d items from market SDK',
        result.currentPage,
        result.totalPages,
        result.items.length,
      );
      return result;
    } catch (error) {
      log('getAssistantList: error fetching from market SDK: %O', error);
      if (options.throwOnError) throw error;

      return {
        currentPage: page,
        items: [],
        pageSize,
        totalCount: 0,
        totalPages: 0,
      };
    }
  };

  // ============================== MCP Market ==============================

  getMcpDetail = async (params: {
    identifier: string;
    locale?: string;
    version?: string;
  }): Promise<DiscoverMcpDetail> => {
    log('getMcpDetail: params=%O', params);
    const { locale } = params;
    const normalizedLocale = normalizeLocale(locale);
    const mcp = await this.market.plugins.getPluginDetail(
      { ...params, locale: normalizedLocale },
      {
        next: {
          revalidate: 3600,
        },
      },
    );

    // Fetch related MCPs
    const list = await this.getMcpList({
      category: mcp.category,
      locale,
      page: 1,
      pageSize: 7,
    });

    const result = {
      ...mcp,
      related: list.items.filter((item) => item.identifier !== mcp.identifier).slice(0, 6),
    };
    log('getMcpDetail: returning mcp with %d related items', result.related.length);
    return result;
  };

  getMcpList = async (params: McpQueryParams = {}): Promise<McpListResponse> => {
    log('getMcpList: params=%O', params);
    const { category, locale, sort } = params;
    const normalizedLocale = normalizeLocale(locale);
    const shouldOmitCategory = [McpCategory.All, McpCategory.Discover].includes(
      category as McpCategory,
    );

    const result = await this.market.plugins.getPluginList(
      {
        ...params,
        category: shouldOmitCategory ? undefined : category,
        locale: normalizedLocale,
        sort: shouldOmitCategory ? McpSorts.Recommended : sort,
      },
      {
        next: {
          revalidate: CacheRevalidate.List,
          tags: [CacheTag.Discover, CacheTag.MCP],
        },
      },
    );
    log('getMcpList: returning %d items on page %d', result.items.length, result.currentPage);
    return result;
  };

  getMcpManifest = async (params: { identifier: string; locale?: string; version?: string }) => {
    log('getMcpManifest: params=%O', params);
    const { locale } = params;
    const normalizedLocale = normalizeLocale(locale);
    const result = await this.market.plugins.getPluginManifest(
      {
        ...params,
        locale: normalizedLocale,
      },
      {
        next: {
          revalidate: CacheRevalidate.List,
          tags: [CacheTag.Discover, CacheTag.MCP],
        },
      },
    );
    log('getMcpManifest: returning manifest for %s', params.identifier);
    return result;
  };

  /**
   * report MCP plugin result marketplace
   */
  reportCall = async (params: CallReportRequest) => {
    await this.market.plugins.reportCall(params);
  };

  /**
   * Increase agent install count in marketplace
   */
  getAgentsByPlugin = async (params: {
    locale?: string;
    page?: number;
    pageSize?: number;
    pluginId: string;
  }): Promise<AssistantListResponse> => {
    log('getAgentsByPlugin: params=%O', params);
    const { locale, pluginId, page = 1, pageSize = 20 } = params;
    const normalizedLocale = normalizeLocale(locale);

    try {
      const data = await this.market.agents.getAgentsByPlugin({
        locale: normalizedLocale,
        page,
        pageSize,
        pluginId,
      });

      const items: DiscoverAssistantItem[] = (data.items || []).map((item: any) => {
        const normalizedAuthor = this.normalizeAuthorField(item.author);
        return {
          author:
            normalizedAuthor.name || (item.ownerId !== null ? `User${item.ownerId}` : 'Unknown'),
          avatar: item.avatar || '',
          category: item.category,
          config: {} as any,
          createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
          description: item.description || '',
          homepage: discoverUrl('assistant', item.identifier),
          identifier: item.identifier,
          installCount: item.installCount,
          knowledgeCount: item.knowledgeCount || 0,
          pluginCount: item.pluginCount || 0,
          schemaVersion: 1,
          tags: item.tags || [],
          title: item.name || item.identifier,
          tokenUsage: item.tokenUsage || 0,
          userName: normalizedAuthor.userName,
        };
      });

      const result: AssistantListResponse = {
        currentPage: data.currentPage || page,
        items,
        pageSize: data.pageSize || pageSize,
        totalCount: data.totalCount || 0,
        totalPages: data.totalPages || 0,
      };

      log(
        'getAgentsByPlugin: returning page %d/%d with %d items',
        result.currentPage,
        result.totalPages,
        result.items.length,
      );
      return result;
    } catch (error) {
      log('getAgentsByPlugin: error fetching from market SDK: %O', error);
      return {
        currentPage: page,
        items: [],
        pageSize,
        totalCount: 0,
        totalPages: 0,
      };
    }
  };

  private _getPluginList = async (locale?: string): Promise<DiscoverPluginItem[]> => {
    log('_getPluginList: locale=%s', locale);
    const normalizedLocale = normalizeLocale(locale);
    const list = await this.pluginStore.getPluginList(normalizedLocale);
    if (!list || !Array.isArray(list)) {
      log('_getPluginList: no valid list found, returning empty array');
      return [];
    }
    const result = list.map(({ meta, ...item }) => ({ ...item, ...meta }));
    log('_getPluginList: returning %d items', result.length);
    return result;
  };

  getPluginList = async (params: PluginQueryParams = {}): Promise<PluginListResponse> => {
    log('getPluginList: params=%O', params);
    const { locale, category, page = 1, pageSize = 20, q } = params;

    let list = await this._getPluginList(locale);

    if (category) {
      list = list.filter((item) => item.category === category);
    }

    if (q) {
      const decoded = decodeURIComponent(q).toLowerCase();
      list = list.filter((item) =>
        [item.author, item.title, item.description, item?.tags]
          .flat()
          .filter(Boolean)
          .join(',')
          .toLowerCase()
          .includes(decoded),
      );
    }

    const result: PluginListResponse = {
      currentPage: page,
      items: list.slice((page - 1) * pageSize, page * pageSize),
      pageSize,
      totalCount: list.length,
      totalPages: Math.ceil(list.length / pageSize),
    };
    log(
      'getPluginList: returning page %d/%d with %d items',
      page,
      result.totalPages,
      result.items.length,
    );
    return result;
  };

  getPluginDetail = async (params: {
    identifier: string;
    locale?: string;
    withManifest?: boolean;
  }): Promise<DiscoverPluginDetail | undefined> => {
    log('getPluginDetail: params=%O', params);
    const { locale, identifier, withManifest } = params;

    // Step 1: Try to find in legacy plugin list
    const all = await this._getPluginList(locale);
    const raw = all.find((item) => item.identifier === identifier);
    if (raw) {
      log('getPluginDetail: found plugin in legacy list for identifier=%s', identifier);
      const mergedRaw = merge(cloneDeep(DEFAULT_DISCOVER_PLUGIN_ITEM), raw);
      const related = all
        .filter((item) => item.category === mergedRaw.category && item.identifier !== identifier)
        .slice(0, 6);

      const plugin: DiscoverPluginDetail = {
        ...mergedRaw,
        related,
        source: 'legacy',
      };

      if (!withManifest || !plugin?.manifest || !isString(plugin?.manifest)) {
        log('getPluginDetail: returning legacy plugin without manifest processing');
        return plugin;
      }

      return plugin;
    }

    // Step 2: Try to find in Market MCP plugins
    log(
      'getPluginDetail: plugin not found in legacy store for identifier=%s, trying MCP plugin',
      identifier,
    );
    try {
      const mcpDetail = await this.getMcpDetail({ identifier, locale });
      const convertedMcp: Partial<DiscoverPluginDetail> = {
        author:
          typeof (mcpDetail as any).author === 'object'
            ? (mcpDetail as any).author?.name || ''
            : (mcpDetail as any).author || '',
        avatar: (mcpDetail as any).icon || (mcpDetail as any).avatar || '',
        category: (mcpDetail as any).category as any,
        createdAt: (mcpDetail as any).createdAt || '',
        description: mcpDetail.description || '',
        homepage: mcpDetail.homepage || '',
        identifier: mcpDetail.identifier,
        manifest: undefined,
        related: mcpDetail.related.map((item) => ({
          author:
            typeof (item as any).author === 'object'
              ? (item as any).author?.name || ''
              : (item as any).author || '',
          avatar: (item as any).icon || (item as any).avatar || '',
          category: (item as any).category as any,
          createdAt: (item as any).createdAt || '',
          description: (item as any).description || '',
          homepage: (item as any).homepage || '',
          identifier: item.identifier,
          manifest: undefined,
          schemaVersion: 1,
          tags: (item as any).tags || [],
          title: (item as any).name || item.identifier,
        })) as unknown as DiscoverPluginItem[],
        schemaVersion: 1,
        source: 'market',
        tags: (mcpDetail as any).tags || [],
        title: (mcpDetail as any).name || mcpDetail.identifier,
      };
      const plugin = merge(cloneDeep(DEFAULT_DISCOVER_PLUGIN_ITEM), convertedMcp);
      log('getPluginDetail: returning converted MCP plugin');
      return plugin as DiscoverPluginDetail;
    } catch {
      log(
        'getPluginDetail: MCP plugin not found for identifier=%s, trying builtin tools',
        identifier,
      );
    }

    // Step 3: Try to find in builtin tools
    const { builtinTools } = await import('@orvilo/builtin-tools');
    const builtinTool = builtinTools.find((tool) => tool.identifier === identifier);
    if (builtinTool) {
      log('getPluginDetail: found builtin tool for identifier=%s', identifier);
      const plugin: DiscoverPluginDetail = {
        author: 'Orvilo',
        avatar: builtinTool.manifest.meta.avatar || '',
        category: undefined,
        createdAt: '',
        description: builtinTool.manifest.meta.description || '',
        homepage: OFFICIAL_SITE,
        identifier: builtinTool.identifier,
        manifest: undefined,
        related: [],
        schemaVersion: 1,
        source: 'builtin',
        tags: builtinTool.manifest.meta.tags || [],
        title: builtinTool.manifest.meta.title,
      };
      log('getPluginDetail: returning builtin tool plugin');
      return plugin;
    }

    // Step 4: Try to find in Composio server types (builtin tools that require env config)
    const composioTool = COMPOSIO_APP_TYPES.find((tool) => tool.identifier === identifier);
    if (composioTool) {
      log('getPluginDetail: found Composio tool for identifier=%s', identifier);

      // Avatar is empty here because frontend will render Composio icons using ComposioIcon component
      // which handles both string URLs and React component icons
      const plugin: DiscoverPluginDetail = {
        author: 'Composio',
        avatar: typeof composioTool.icon === 'string' ? composioTool.icon : '',
        category: undefined,
        createdAt: '',
        description: `Orvilo Mcp Server: ${composioTool.label}`,
        homepage: 'https://composio.dev',
        identifier: composioTool.identifier,
        manifest: undefined,
        related: [],
        schemaVersion: 1,
        source: 'builtin',
        tags: ['composio', 'mcp'],
        title: composioTool.label,
      };
      log('getPluginDetail: returning Composio tool plugin');
      return plugin;
    }

    log('getPluginDetail: plugin not found anywhere for identifier=%s', identifier);
    return;
  };
}
