// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantStore } from '@/server/modules/AssistantStore';
import { PluginStore } from '@/server/modules/PluginStore';

import { DiscoverService } from './index';

// Mock external dependencies
vi.mock('@/server/modules/AssistantStore');
vi.mock('@/server/modules/PluginStore');
vi.mock('@lobehub/market-sdk');
vi.mock('@/locales/resources', () => ({
  normalizeLocale: vi.fn(function (locale) {
    if (locale === 'en-US') return 'en';
    return locale || 'en';
  }),
}));

// Mock constants with inline data
vi.mock('@/const/discover', () => ({
  DEFAULT_DISCOVER_ASSISTANT_ITEM: {},
  DEFAULT_DISCOVER_PLUGIN_ITEM: {},
}));

// Mock data - moved after mocks to avoid hoisting issues
const mockAssistantList = [
  {
    identifier: 'assistant-1',
    title: 'Test Assistant 1',
    description: 'A test assistant',
    author: 'Test Author',
    category: 'productivity',
    createdAt: '2024-01-01T00:00:00Z',
    knowledgeCount: 5,
    pluginCount: 2,
    tokenUsage: 1000,
    tags: ['test', 'assistant'],
  },
  {
    identifier: 'assistant-2',
    title: 'Test Assistant 2',
    description: 'Another test assistant',
    author: 'Test Author 2',
    category: 'productivity', // Changed to same category for related items test
    createdAt: '2024-01-02T00:00:00Z',
    knowledgeCount: 3,
    pluginCount: 1,
    tokenUsage: 500,
    tags: ['test', 'creative'],
  },
  {
    identifier: 'assistant-3',
    title: 'Test Assistant 3',
    description: 'A creative assistant',
    author: 'Test Author 3',
    category: 'creativity', // Keep this for category filtering tests
    createdAt: '2024-01-03T00:00:00Z',
    knowledgeCount: 2,
    pluginCount: 0,
    tokenUsage: 300,
    tags: ['test', 'creative'],
  },
];

const mockMarketAssistantList = [
  {
    identifier: 'market-assistant-1',
    name: 'Market Assistant 1',
    summary: 'First market assistant from new source',
    author: { name: 'Market Author 1', avatar: 'https://example.com/avatar1.png' },
    ownerId: 101,
    category: 'productivity',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-02T00:00:00Z',
    avatar: 'https://example.com/avatar1.png',
    tags: ['market', 'assistant'],
    status: 'published',
    tokenUsage: 256,
    config: {
      systemRole: 'You are a productive assistant.',
      knowledgeBases: [{ id: 'kb-1' }],
      plugins: [{ id: 'plugin-1' }],
    },
  },
  {
    identifier: 'market-assistant-2',
    name: 'Market Assistant 2',
    summary: 'Second market assistant from new source',
    author: 'Market Author 2',
    ownerId: 202,
    category: 'creativity',
    createdAt: '2024-02-04T00:00:00Z',
    updatedAt: '2024-02-05T00:00:00Z',
    avatar: 'https://example.com/avatar2.png',
    tags: ['market', 'creative'],
    status: 'published',
    tokenUsage: 128,
    config: {
      systemRole: 'You are a creative assistant.',
      knowledgeBases: [],
      plugins: [],
    },
  },
];

const mockMarketAgentDetail = {
  ...mockMarketAssistantList[0],
  documentationUrl: 'https://example.com/docs',
  version: '1.0.0',
  versions: [
    {
      version: '1.0.0',
      status: 'published',
      isLatest: true,
      isValidated: true,
      createdAt: '2024-02-02T00:00:00Z',
    },
  ],
  examples: [
    {
      content: 'Example content',
      role: 'user',
    },
  ],
};

const mockPluginList = [
  {
    identifier: 'plugin-1',
    title: 'Test Plugin 1',
    description: 'A test plugin',
    author: 'Plugin Author',
    category: 'tools',
    createdAt: '2024-01-01T00:00:00Z',
    tags: ['test', 'plugin'],
    manifest: 'https://example.com/plugin1/manifest.json',
  },
  {
    identifier: 'plugin-2',
    title: 'Test Plugin 2',
    description: 'Another test plugin',
    author: 'Plugin Author 2',
    category: 'utilities',
    createdAt: '2024-01-02T00:00:00Z',
    tags: ['test', 'utility'],
    manifest: 'https://example.com/plugin2/manifest.json',
  },
];

describe('DiscoverService', () => {
  let service: DiscoverService;
  let mockAssistantStore: any;
  let mockPluginStore: any;
  let mockMarket: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup AssistantStore mock
    mockAssistantStore = {
      getAgentIndex: vi
        .fn()
        .mockResolvedValue(mockAssistantList.map((item) => ({ ...item, meta: {} }))),
      getAgent: vi.fn().mockImplementation(function (identifier) {
        const agent = mockAssistantList.find((a) => a.identifier === identifier);
        return Promise.resolve(agent ? { ...agent, meta: {} } : null);
      }),
    };

    // Setup PluginStore mock
    mockPluginStore = {
      getPluginList: vi
        .fn()
        .mockResolvedValue(mockPluginList.map((item) => ({ ...item, meta: {} }))),
    };

    // Setup MarketSDK mock
    mockMarket = {
      agents: {
        getAgentList: vi.fn().mockResolvedValue({
          categoryCounts: [
            { category: 'creativity', count: 1 },
            { category: 'productivity', count: 1 },
          ],
          items: mockMarketAssistantList,
          totalCount: mockMarketAssistantList.length,
          currentPage: 1,
          pageSize: 20,
          totalPages: 1,
        }),
        getAgentDetail: vi.fn().mockResolvedValue(mockMarketAgentDetail),
        getCategories: vi.fn().mockResolvedValue([
          { category: 'productivity', count: 10 },
          { category: 'creativity', count: 5 },
        ]),
        getPublishedIdentifiers: vi.fn().mockResolvedValue([
          { id: 'market-assistant-1', lastModified: '2024-02-02T00:00:00Z' },
          { id: 'market-assistant-2', lastModified: '2024-02-05T00:00:00Z' },
        ]),
      },
      plugins: {
        getCategories: vi.fn().mockResolvedValue([
          { category: 'tools', count: 5 },
          { category: 'utilities', count: 3 },
        ]),
        getPluginDetail: vi.fn().mockImplementation(function (params) {
          const plugin = mockPluginList.find((p) => p.identifier === params.identifier);
          return Promise.resolve(plugin || null);
        }),
        getPluginList: vi.fn().mockResolvedValue({
          items: mockPluginList,
          totalCount: mockPluginList.length,
          currentPage: 1,
          pageSize: 20,
          totalPages: 1,
        }),
        getPublishedIdentifiers: vi
          .fn()
          .mockResolvedValue(
            mockPluginList.map((p) => ({ identifier: p.identifier, lastModified: p.createdAt })),
          ),
        getPluginManifest: vi.fn().mockResolvedValue({}),
      },
    };

    (AssistantStore as any).mockImplementation(function () {
      return mockAssistantStore;
    });
    (PluginStore as any).mockImplementation(function () {
      return mockPluginStore;
    });

    service = new DiscoverService();
    service.market = mockMarket;
  });

  describe('Assistant Market (new source)', () => {
    it('getAssistantList should transform market SDK response', async () => {
      const result = await service.getAssistantList({ includeCategoryCounts: true });

      expect(mockMarket.agents.getAgentList).toHaveBeenCalledWith(
        expect.objectContaining({ includeCategoryCounts: true }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          identifier: 'market-assistant-1',
          title: 'Market Assistant 1',
          author: 'Market Author 1',
          knowledgeCount: 1,
          pluginCount: 1,
        }),
      );
      expect(result.categoryCounts).toEqual([
        { category: 'creativity', count: 1 },
        { category: 'productivity', count: 1 },
      ]);
    });

    it('getAssistantList should preserve a successful empty response in strict mode', async () => {
      mockMarket.agents.getAgentList.mockResolvedValue({
        currentPage: 1,
        items: [],
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
      });

      const result = await service.getAssistantList({ q: 'missing' }, { throwOnError: true });

      expect(result).toEqual({
        currentPage: 1,
        items: [],
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
      });
    });

    it('getAssistantList should rethrow market errors in strict mode', async () => {
      const marketError = new Error('Market unavailable');
      mockMarket.agents.getAgentList.mockRejectedValue(marketError);

      await expect(
        service.getAssistantList({ q: 'assistant' }, { throwOnError: true }),
      ).rejects.toBe(marketError);
    });

    it('getAssistantList should retain the empty fallback by default', async () => {
      mockMarket.agents.getAgentList.mockRejectedValue(new Error('Market unavailable'));

      const result = await service.getAssistantList({ q: 'assistant' });

      expect(result).toEqual({
        currentPage: 1,
        items: [],
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
      });
    });

    it('getAssistantDetail should fetch from market SDK by default', async () => {
      const result = await service.getAssistantDetail({
        identifier: 'market-assistant-1',
      });

      expect(mockMarket.agents.getAgentDetail).toHaveBeenCalledWith('market-assistant-1', {
        locale: 'en',
        version: undefined,
      });
      expect(result).toEqual(
        expect.objectContaining({
          identifier: 'market-assistant-1',
          title: 'Market Assistant 1',
          related: expect.any(Array),
        }),
      );
    });

    describe('Assistant Market (legacy source)', () => {
      describe('getAssistantList', () => {
        it('should return formatted assistant list with default parameters', async () => {
          const result = await service.getAssistantList({ source: 'legacy' });

          expect(result).toEqual({
            currentPage: 1,
            pageSize: 20,
            totalCount: 3,
            totalPages: 1,
            items: expect.arrayContaining([
              expect.objectContaining({
                identifier: 'assistant-1',
                title: 'Test Assistant 1',
              }),
              expect.objectContaining({
                identifier: 'assistant-2',
                title: 'Test Assistant 2',
              }),
              expect.objectContaining({
                identifier: 'assistant-3',
                title: 'Test Assistant 3',
              }),
            ]),
          });
        });

        it('should filter by category', async () => {
          const result = await service.getAssistantList({
            category: 'productivity',
            source: 'legacy',
          });

          expect(result.items).toHaveLength(2);
          expect(result.items.map((item) => item.identifier)).toContain('assistant-1');
          expect(result.items.map((item) => item.identifier)).toContain('assistant-2');
        });

        it('should filter by search query', async () => {
          const result = await service.getAssistantList({ q: 'creative', source: 'legacy' });

          expect(result.items).toHaveLength(2);
          expect(result.items.map((item) => item.identifier)).toContain('assistant-2');
          expect(result.items.map((item) => item.identifier)).toContain('assistant-3');
        });

        it('should paginate results', async () => {
          const result = await service.getAssistantList({ page: 1, pageSize: 1, source: 'legacy' });

          expect(result.items).toHaveLength(1);
          expect(result.currentPage).toBe(1);
          expect(result.pageSize).toBe(1);
          expect(result.totalPages).toBe(3);
        });
      });

      describe('getAssistantDetail', () => {
        it('should return assistant detail with related items', async () => {
          const result = await service.getAssistantDetail({
            identifier: 'assistant-1',
            source: 'legacy',
          });

          expect(result).toEqual(
            expect.objectContaining({
              identifier: 'assistant-1',
              title: 'Test Assistant 1',
              related: expect.any(Array),
            }),
          );
          expect(result?.related).toHaveLength(1);
          expect(result?.related[0].identifier).toBe('assistant-2');
        });

        it('should return undefined for non-existent assistant', async () => {
          mockAssistantStore.getAgent.mockResolvedValue(null);

          const result = await service.getAssistantDetail({
            identifier: 'non-existent',
            source: 'legacy',
          });

          expect(result).toBeUndefined();
        });
      });
    });

    describe('Plugin Market', () => {
      describe('getPluginDetail', () => {
        it('should return plugin detail with related items', async () => {
          const result = await service.getPluginDetail({
            identifier: 'plugin-1',
          });

          expect(result).toEqual(
            expect.objectContaining({
              identifier: 'plugin-1',
              title: 'Test Plugin 1',
              related: expect.any(Array),
            }),
          );
        });

        it('should return undefined for non-existent plugin', async () => {
          const result = await service.getPluginDetail({
            identifier: 'non-existent',
          });

          expect(result).toBeUndefined();
        });
      });
    });

    describe('MCP Market', () => {
      describe('getMcpList', () => {
        it('should call market SDK with normalized locale', async () => {
          await service.getMcpList({ locale: 'en-US' });

          expect(mockMarket.plugins.getPluginList).toHaveBeenCalledWith(
            expect.objectContaining({
              locale: 'en',
            }),
            expect.any(Object),
          );
        });
      });

      describe('getMcpDetail', () => {
        it('should return MCP detail with related items', async () => {
          const mockMcp = { identifier: 'mcp-1', category: 'tools' };
          mockMarket.plugins.getPluginDetail.mockResolvedValue(mockMcp);

          const result = await service.getMcpDetail({
            identifier: 'mcp-1',
          });

          expect(result).toEqual(
            expect.objectContaining({
              identifier: 'mcp-1',
              related: expect.any(Array),
            }),
          );
        });
      });
    });
  });
});
