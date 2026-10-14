// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderSkillsAgentDocument } from './ProviderSkillsAgentDocument';

vi.mock('@/server/services/agentDocuments/headlessEditor', () => ({
  createMarkdownEditorSnapshot: vi.fn(async (content: string) => ({
    content,
    editorData: { markdown: content },
  })),
  exportEditorDataSnapshot: vi.fn(async ({ fallbackContent }: { fallbackContent?: string }) => ({
    content: fallbackContent ?? '',
    editorData: { exported: true },
  })),
}));

const createAgentDocument = (overrides: Record<string, unknown> = {}) =>
  ({
    content: 'existing content',
    documentId: 'document-1',
    editorData: { root: { children: [] } },
    fileType: 'custom/document',
    filename: 'skill-a',
    id: 'agent-doc-1',
    metadata: null,
    parentId: null,
    policy: null,
    policyLoad: 'progressive',
    templateId: null,
    title: 'skill-a',
    ...overrides,
  }) as any;

describe('Agent skill VFS providers', () => {
  const agentDocumentModel = {
    associate: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteSubtreeByDocumentId: vi.fn(),
    findByAgent: vi.fn(),
    update: vi.fn(),
  };
  const documentService = {
    createDocument: vi.fn(),
    deleteDocument: vi.fn(),
    trySaveCurrentDocumentHistory: vi.fn(),
    updateDocument: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ProviderSkillsAgentDocument agent namespace', () => {
    it('lists only bundle-backed agent skills at the namespace root', async () => {
      agentDocumentModel.findByAgent.mockResolvedValue([
        createAgentDocument({
          documentId: 'bundle-1',
          fileType: 'skills/bundle',
          filename: 'agent-skill',
          id: 'agent-doc-bundle',
          templateId: 'agent-skill',
          parentId: null,
        }),
        createAgentDocument({
          documentId: 'file-1',
          fileType: 'skills/index',
          filename: 'SKILL.md',
          id: 'agent-doc-file',
          templateId: 'agent-skill',
          parentId: 'bundle-1',
        }),
        createAgentDocument({
          documentId: 'plain-folder',
          fileType: 'custom/folder',
          filename: 'plain-folder',
          id: 'agent-doc-plain-folder',
          metadata: null,
          parentId: null,
        }),
      ]);

      const provider = new ProviderSkillsAgentDocument('agent', {
        agentDocumentModel,
        documentService,
      });

      const result = await provider.list({
        agentId: 'agent-1',
        path: './orvilo/skills/agent/skills',
        resolvedPath: { namespace: 'agent', relativePath: '' },
      });

      expect(result).toEqual([
        expect.objectContaining({
          name: 'agent-skill',
          namespace: 'agent',
          path: './orvilo/skills/agent/skills/agent-skill',
          type: 'directory',
        }),
      ]);
    });

    it('rejects platform skill create, update and deletion without touching history', async () => {
      const provider = new ProviderSkillsAgentDocument('agent', {
        agentDocumentModel,
        documentService,
      });
      await expect(
        provider.create({
          agentId: 'agent-1',
          content: '# Skill',
          skillName: 'writer',
          targetNamespace: 'agent',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        provider.update({
          agentId: 'agent-1',
          content: '# Changed',
          path: './orvilo/skills/agent/skills/writer/SKILL.md',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        provider.delete({
          agentId: 'agent-1',
          path: './orvilo/skills/agent/skills/writer/SKILL.md',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(agentDocumentModel.create).not.toHaveBeenCalled();
      expect(agentDocumentModel.update).not.toHaveBeenCalled();
      expect(agentDocumentModel.deleteSubtreeByDocumentId).not.toHaveBeenCalled();
      expect(documentService.trySaveCurrentDocumentHistory).not.toHaveBeenCalled();
    });
  });
});
