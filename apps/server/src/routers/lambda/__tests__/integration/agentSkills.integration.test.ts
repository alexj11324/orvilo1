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

  const getManagedSkillBindingId = async ({
    agentId,
    skillName,
  }: {
    agentId: string;
    skillName: string;
  }) => {
    const documents = await agentDocumentModel.findByAgent(agentId);
    const bundle = documents.find(
      (item) =>
        item.fileType === SKILL_BUNDLE_FILE_TYPE &&
        item.filename === skillName &&
        item.parentId === null &&
        item.templateId === AGENT_SKILL_TEMPLATE_ID,
    );
    const document = documents.find(
      (item) =>
        item.fileType === SKILL_INDEX_FILE_TYPE &&
        item.filename === SKILL_INDEX_FILENAME &&
        item.parentId === bundle?.documentId &&
        item.templateId === AGENT_SKILL_TEMPLATE_ID,
    );

    if (!document) {
      throw new Error(`Expected managed skill document agent:${skillName} to exist`);
    }

    return document.id;
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

  describe('VFS write APIs', () => {
    it('should create an agent skill through the VFS API', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      const result = await caller.createSkillByPath({
        agentId,
        content: '# Research Helper\n\nUse this skill for research.',
        skillName: 'research-helper',
        targetNamespace: 'agent',
      });

      if (!result) {
        throw new Error('Expected createSkill to return a skill file node');
      }

      expect(result.mount?.namespace).toBe('agent');
      expect(result.path).toBe('./orvilo/skills/agent/skills/research-helper/SKILL.md');

      const fileNode = await caller.readDocumentByPath({
        agentId,
        path: './orvilo/skills/agent/skills/research-helper/SKILL.md',
      });

      if (!fileNode) {
        throw new Error('Expected created agent skill file to exist');
      }

      expect(fileNode.content?.trimEnd()).toBe('# Research Helper\n\nUse this skill for research.');
    });

    it('should delete an agent skill through the VFS API', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      const created = await caller.createSkillByPath({
        agentId,
        content: '# Disposable Skill\n\nTemporary content.',
        skillName: 'disposable-skill',
        targetNamespace: 'agent',
      });

      if (!created) {
        throw new Error('Expected createSkill to return a disposable skill file node');
      }

      await caller.deleteSkillByPath({
        agentId,
        path: created.path,
      });

      await expect(
        caller.readDocumentByPath({
          agentId,
          path: created.path,
        }),
      ).rejects.toThrow();
    });

    it('should surface CONFLICT when creating a duplicate VFS skill', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await caller.createSkillByPath({
        agentId,
        content: '# Research Helper\n\nUse this skill for research.',
        skillName: 'research-helper',
        targetNamespace: 'agent',
      });

      await expect(
        caller.createSkillByPath({
          agentId,
          content: '# Research Helper\n\nDuplicate content.',
          skillName: 'research-helper',
          targetNamespace: 'agent',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('should surface NOT_FOUND when deleting a missing VFS skill', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await expect(
        caller.deleteSkillByPath({
          agentId,
          path: './orvilo/skills/agent/skills/missing-skill/SKILL.md',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should surface BAD_REQUEST for invalid skill names', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await expect(
        caller.createSkillByPath({
          agentId,
          content: '# Invalid',
          skillName: 'bad/name',
          targetNamespace: 'agent',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('should surface BAD_REQUEST for unsupported VFS file paths on update', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await expect(
        caller.updateSkillByPath({
          agentId,
          content: '# Updated',
          path: './orvilo/skills/agent/skills/research-helper/notes.md',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('should surface METHOD_NOT_SUPPORTED when renaming a skill-managed document through agentDocument', async () => {
      const skillCaller = agentDocumentRouter.createCaller(createTestContext(userId));
      const documentCaller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await skillCaller.createSkillByPath({
        agentId,
        content: '# Research Helper\n\nUse this skill for research.',
        skillName: 'research-helper',
        targetNamespace: 'agent',
      });

      const id = await getManagedSkillBindingId({
        agentId,
        skillName: 'research-helper',
      });

      await expect(
        documentCaller.renameDocument({
          agentId,
          id,
          newTitle: 'Renamed Skill',
        }),
      ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    });

    it('should surface METHOD_NOT_SUPPORTED when copying a skill-managed document through agentDocument', async () => {
      const skillCaller = agentDocumentRouter.createCaller(createTestContext(userId));
      const documentCaller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await skillCaller.createSkillByPath({
        agentId,
        content: '# Research Helper\n\nUse this skill for research.',
        skillName: 'research-helper',
        targetNamespace: 'agent',
      });

      const id = await getManagedSkillBindingId({
        agentId,
        skillName: 'research-helper',
      });

      await expect(
        documentCaller.copyDocument({
          agentId,
          id,
          newTitle: 'Copied Skill',
        }),
      ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    });
  });

  describe('convertDocumentToSkill', () => {
    it('should migrate an existing document into a managed skill in place', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      const doc = await caller.createDocument({
        agentId,
        content: '# Weekly Report\n\nSummarize the week.',
        title: 'Weekly Report',
      });

      const sourceAgentDocumentId = doc!.id;

      const skill = await caller.convertDocumentToSkill({
        agentId,
        description: 'Generate the weekly report.',
        name: 'weekly-report',
        sourceAgentDocumentId,
        title: 'Weekly Report',
      });

      expect(skill.name).toBe('weekly-report');
      expect(skill.content).toContain('name: weekly-report');
      expect(skill.content).toContain('description: Generate the weekly report.');
      expect(skill.content).toContain('Summarize the week.');

      // The original document row is reused as the SKILL.md index (id preserved).
      expect(skill.index.agentDocumentId).toBe(sourceAgentDocumentId);

      const indexRow = await new AgentDocumentModel(serverDB, userId).findById(
        sourceAgentDocumentId,
      );
      expect(indexRow?.fileType).toBe(SKILL_INDEX_FILE_TYPE);
      expect(indexRow?.filename).toBe(SKILL_INDEX_FILENAME);
      expect(indexRow?.templateId).toBe(AGENT_SKILL_TEMPLATE_ID);

      // A bundle parent was created to hold the index.
      const bundleRow = await new AgentDocumentModel(serverDB, userId).findById(
        skill.bundle.agentDocumentId,
      );
      expect(bundleRow?.fileType).toBe(SKILL_BUNDLE_FILE_TYPE);
      expect(bundleRow?.filename).toBe('weekly-report');
      expect(indexRow?.parentId).toBe(bundleRow?.documentId);
    });

    it('should surface NOT_FOUND when the source document does not exist', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      await expect(
        caller.convertDocumentToSkill({
          agentId,
          description: 'desc',
          name: 'missing-doc',
          sourceAgentDocumentId: '00000000-0000-0000-0000-000000000000',
          title: 'Missing',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should surface BAD_REQUEST for an invalid skill name', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      const doc = await caller.createDocument({
        agentId,
        content: '# Doc\n\nBody.',
        title: 'Doc',
      });

      await expect(
        caller.convertDocumentToSkill({
          agentId,
          description: 'desc',
          name: 'Bad Name',
          sourceAgentDocumentId: doc!.id,
          title: 'Doc',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('should reject converting an existing managed skill index', async () => {
      const caller = agentDocumentRouter.createCaller(createTestContext(userId));
      const agentId = await createTestAgent(serverDB, userId);

      const doc = await caller.createDocument({
        agentId,
        content: '# Existing Skill\n\nBody.',
        title: 'Existing Skill',
      });

      const skill = await caller.convertDocumentToSkill({
        agentId,
        description: 'An existing skill.',
        name: 'existing-skill',
        sourceAgentDocumentId: doc!.id,
        title: 'Existing Skill',
      });

      // Converting the managed skill index again would reparent it under a new
      // bundle and strip the original bundle of its SKILL.md, corrupting it.
      await expect(
        caller.convertDocumentToSkill({
          agentId,
          description: 'desc',
          name: 'another-skill',
          sourceAgentDocumentId: skill.index.agentDocumentId,
          title: 'Another Skill',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
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

      const doc = await caller.createDocument({
        agentId,
        content: '# Existing Skill\n\nBody.',
        title: 'Existing Skill',
      });

      const skill = await caller.convertDocumentToSkill({
        agentId,
        description: 'An existing skill.',
        name: 'existing-skill',
        sourceAgentDocumentId: doc!.id,
        title: 'Existing Skill',
      });

      // Shares the convert guard: managed skill rows are not convertible, so
      // meta generation must reject before reaching the model.
      await expect(
        caller.generateSkillMeta({
          agentId,
          sourceAgentDocumentId: skill.index.agentDocumentId,
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
