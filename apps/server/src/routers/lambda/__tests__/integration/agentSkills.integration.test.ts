// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import { agentSkills } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDocumentModel } from '@/database/models/agentDocuments';
import {
  AGENT_SKILL_TEMPLATE_ID,
  SKILL_BUNDLE_FILE_TYPE,
  SKILL_INDEX_FILE_TYPE,
  SKILL_INDEX_FILENAME,
} from '@/server/services/skillManagement';

import { agentDocumentRouter } from '../../agentDocument';
import { agentSkillsRouter } from '../../agentSkills';
import { cleanupTestUser, createTestAgent, createTestContext, createTestUser } from './setup';

// Mock getServerDB to return our test database instance
let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return testDB;
  }),
}));

// Mock FileService to avoid S3 dependency
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      createGlobalFile: vi.fn().mockResolvedValue({ id: 'mock-global-file-id' }),
      createFileRecord: vi
        .fn()
        .mockResolvedValue({ fileId: 'mock-file-id', url: '/f/mock-file-id' }),
      downloadFileToLocal: vi.fn(),
      getFileContent: vi.fn(),
      uploadBuffer: vi.fn().mockResolvedValue({ key: 'mock-key' }),
      uploadMedia: vi.fn().mockResolvedValue({ key: 'mock-key' }),
    };
  }),
}));

// Mock SkillResourceService to avoid S3 dependency
vi.mock('@/server/services/skill/resource', () => ({
  SkillResourceService: vi.fn().mockImplementation(function () {
    return {
      storeResources: vi.fn().mockResolvedValue({}),
      readResource: vi.fn().mockRejectedValue(new Error('Resource not found')),
      listResources: vi.fn().mockResolvedValue([]),
    };
  }),
}));

describe('Skill Router Integration Tests', () => {
  let serverDB: OrviloDatabase;
  let agentDocumentModel: AgentDocumentModel;
  let userId: string;

  beforeEach(async () => {
    serverDB = await getTestDB();
    testDB = serverDB;
    userId = await createTestUser(serverDB);
    agentDocumentModel = new AgentDocumentModel(serverDB, userId);
  });

  afterEach(async () => {
    await cleanupTestUser(serverDB, userId);
  });

  /**
   * Seed a skill row directly. The router's `create` / import procedures were
   * retired with the platform Skill-management chain, so the read APIs under
   * test are exercised against rows inserted through the schema.
   */
  const seedSkill = async (values: {
    content?: string;
    description: string;
    identifier: string;
    name: string;
  }) => {
    const [row] = await serverDB
      .insert(agentSkills)
      .values({
        content: values.content,
        description: values.description,
        identifier: values.identifier,
        manifest: { name: values.name, description: values.description },
        name: values.name,
        source: 'user',
        userId,
      })
      .returning();
    return row;
  };

  const seedManagedSkill = async (agentId: string, name = 'historical-skill') => {
    const bundle = await agentDocumentModel.create(agentId, name, '', {
      fileType: SKILL_BUNDLE_FILE_TYPE,
      templateId: AGENT_SKILL_TEMPLATE_ID,
    });
    const index = await agentDocumentModel.create(
      agentId,
      SKILL_INDEX_FILENAME,
      '# Historical skill',
      {
        fileType: SKILL_INDEX_FILE_TYPE,
        templateId: AGENT_SKILL_TEMPLATE_ID,
        parentId: bundle.documentId,
      },
    );
    return { bundle, index, path: `./orvilo/skills/agent/skills/${name}/SKILL.md` };
  };

  describe('list', () => {
    it('should list all skills for user', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      await seedSkill({
        name: 'Skill 1',
        content: '# Skill 1',
        description: 'Skill 1 desc',
        identifier: 'list.skill-1',
      });
      await seedSkill({
        name: 'Skill 2',
        content: '# Skill 2',
        description: 'Skill 2 desc',
        identifier: 'list.skill-2',
      });

      const result = await caller.list();

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter skills by source', async () => {
      // Insert skills with different sources directly
      await serverDB.insert(agentSkills).values([
        {
          name: 'User Skill',
          description: 'User skill description',
          identifier: 'user.skill',
          source: 'user',
          manifest: { name: 'User Skill', description: 'User skill description' },
          userId,
        },
        {
          name: 'Market Skill',
          description: 'Market skill description',
          identifier: 'market.skill',
          source: 'market',
          manifest: { name: 'Market Skill', description: 'Market skill description' },
          userId,
        },
      ]);

      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const userSkills = await caller.list({ source: 'user' });
      expect(userSkills.data).toHaveLength(1);
      expect(userSkills.data[0].source).toBe('user');

      const marketSkills = await caller.list({ source: 'market' });
      expect(marketSkills.data).toHaveLength(1);
      expect(marketSkills.data[0].source).toBe('market');
    });
  });

  describe('getById', () => {
    it('should get skill by id', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const created = await seedSkill({
        name: 'Get By ID Skill',
        content: '# Get By ID',
        description: 'Get by ID skill',
        identifier: 'get-by-id.skill',
      });

      const result = await caller.getById({ id: created!.id });

      expect(result).toBeDefined();
      expect(result?.id).toBe(created!.id);
      expect(result?.name).toBe('Get By ID Skill');
    });

    it('should return undefined for non-existent id', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const result = await caller.getById({ id: 'non-existent-id' });

      expect(result).toBeUndefined();
    });
  });

  describe('getByIdentifier', () => {
    it('should get skill by identifier', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      await seedSkill({
        name: 'By Identifier',
        content: '# By Identifier',
        description: 'By identifier skill',
        identifier: 'test.by.identifier',
      });

      const result = await caller.getByIdentifier({ identifier: 'test.by.identifier' });

      expect(result).toBeDefined();
      expect(result?.identifier).toBe('test.by.identifier');
    });
  });

  describe('getByName', () => {
    it('should get skill by name', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      await seedSkill({
        name: 'Unique Skill Name',
        content: '# By Name',
        description: 'By name skill',
        identifier: 'get-by-name.skill',
      });

      const result = await caller.getByName({ name: 'Unique Skill Name' });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Unique Skill Name');
    });

    it('should return undefined for non-existent name', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const result = await caller.getByName({ name: 'non-existent-name' });

      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search skills by name', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      await seedSkill({
        name: 'TypeScript Expert',
        content: '# TS',
        description: 'TS expert',
        identifier: 'search.ts-expert',
      });
      await seedSkill({
        name: 'Python Master',
        content: '# Py',
        description: 'Py master',
        identifier: 'search.py-master',
      });

      const result = await caller.search({ query: 'TypeScript' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('TypeScript Expert');
    });

    it('should search skills by description', async () => {
      await serverDB.insert(agentSkills).values([
        {
          name: 'Skill A',
          description: 'Helps with coding tasks',
          identifier: 'search.a',
          source: 'user',
          manifest: { name: 'Skill A', description: 'Helps with coding tasks' },
          userId,
        },
        {
          name: 'Skill B',
          description: 'Helps with writing',
          identifier: 'search.b',
          source: 'user',
          manifest: { name: 'Skill B', description: 'Helps with writing' },
          userId,
        },
      ]);

      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const result = await caller.search({ query: 'coding' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Skill A');
    });
  });

  describe('retired platform skill writers', () => {
    it('rejects VFS skill creation without persisting documents', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);
      await expect(
        caller.createSkillByPath({
          agentId,
          content: '# New skill',
          skillName: 'new-skill',
          targetNamespace: 'agent',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await agentDocumentModel.findByAgent(agentId)).toEqual([]);
    });

    it('keeps historical VFS skills readable while refusing update and deletion', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);
      const { path, index } = await seedManagedSkill(agentId);
      await expect(
        caller.updateSkillByPath({ agentId, path, content: '# Changed' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.deleteSkillByPath({ agentId, path })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await caller.readDocumentByPath({ agentId, path })).toMatchObject({
        content: '# Historical skill',
      });
      expect(await agentDocumentModel.findById(index.id)).toMatchObject({
        content: '# Historical skill',
        deletedAt: null,
      });
    });

    it('refuses conversion and preserves the ordinary source document', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);
      const doc = await caller.createDocument({
        agentId,
        content: '# Report\n\nBody.',
        title: 'Report',
      });
      const before = await agentDocumentModel.findById(doc!.id);
      await expect(
        caller.convertDocumentToSkill({
          agentId,
          description: 'Report skill',
          name: 'report',
          sourceAgentDocumentId: doc!.id,
          title: 'Report',
        }),
      ).rejects.toThrow('Platform skill production has been retired');
      expect(await agentDocumentModel.findById(doc!.id)).toEqual(before);
      expect(await agentDocumentModel.findByAgent(agentId)).toHaveLength(1);
    });

    it('preserves the ordinary API guards for historical skill identity', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);
      const { index } = await seedManagedSkill(agentId);
      await expect(
        caller.renameDocument({ agentId, id: index.id, newTitle: 'Renamed' }),
      ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
      await expect(
        caller.copyDocument({ agentId, id: index.id, newTitle: 'Copied' }),
      ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    });
  });

  describe('generateSkillMeta', () => {
    it('should surface NOT_FOUND when the source document does not exist', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await expect(
        caller.generateSkillMeta({
          agentId,
          sourceAgentDocumentId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should reject generating meta for an existing managed skill', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      const skill = await seedManagedSkill(agentId);

      // Shares the convert guard: managed skill rows are not convertible, so
      // meta generation must reject before reaching the model.
      await expect(
        caller.generateSkillMeta({
          agentId,
          sourceAgentDocumentId: skill.index.id,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('listResources', () => {
    it('should return empty array for skill without resources', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const created = await seedSkill({
        name: 'No Resources',
        content: '# No Resources',
        description: 'Skill without resources',
        identifier: 'no-resources.list',
      });

      const result = await caller.listResources({ id: created!.id });

      // Mock returns empty array
      expect(result).toEqual([]);
    });

    it('should throw for non-existent skill', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      // getById returns undefined, which triggers NOT_FOUND TRPCError
      await expect(caller.listResources({ id: 'non-existent' })).rejects.toThrow();
    });
  });

  describe('readResource', () => {
    it('should throw for non-existent skill', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      // getById returns undefined, which triggers NOT_FOUND TRPCError
      await expect(
        caller.readResource({ id: 'non-existent', path: 'readme.md' }),
      ).rejects.toThrow();
    });

    it('should throw for skill without resources', async () => {
      const caller = agentSkillsRouter.createCaller(createTestContext(userId));

      const created = await seedSkill({
        name: 'No Resources',
        content: '# No Resources',
        description: 'Skill without resources',
        identifier: 'no-resources.read',
      });

      // Skill exists but has no resources, triggers BAD_REQUEST with message
      await expect(caller.readResource({ id: created!.id, path: 'readme.md' })).rejects.toThrow(
        'Skill has no resources',
      );
    });
  });

  describe('user isolation', () => {
    it('should not access skills from other users', async () => {
      // Seed a skill for the original user
      await seedSkill({
        name: 'User 1 Skill',
        content: '# User 1',
        description: 'User 1 skill',
        identifier: 'isolation.user-1',
      });

      // Create another user
      const otherUserId = await createTestUser(serverDB);
      const caller2 = agentSkillsRouter.createCaller(createTestContext(otherUserId));

      // Other user should not see original user's skills
      const otherUserSkills = await caller2.list();
      expect(otherUserSkills.data).toHaveLength(0);

      // Cleanup other user
      await cleanupTestUser(serverDB, otherUserId);
    });

    it('never exposes the skills of another user through a read procedure', async () => {
      const caller1 = agentSkillsRouter.createCaller(createTestContext(userId));
      const created = await seedSkill({
        name: 'Protected',
        content: '# Protected',
        description: 'Protected skill',
        identifier: 'isolation.protected',
      });

      // Create another user
      const otherUserId = await createTestUser(serverDB);
      const caller2 = agentSkillsRouter.createCaller(createTestContext(otherUserId));

      // Reads are user-scoped, so the other user resolves nothing — not even by
      // the identifier that would bypass the id filter.
      expect(await caller2.getById({ id: created!.id })).toBeUndefined();
      expect(await caller2.getByIdentifier({ identifier: 'isolation.protected' })).toBeUndefined();

      // Original skill should still exist
      const stillExists = await caller1.getById({ id: created!.id });
      expect(stillExists).toBeDefined();

      await cleanupTestUser(serverDB, otherUserId);
    });
  });
});
