// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { SkillManagementDocumentService } from './SkillManagementDocumentService';

vi.mock('@/database/models/agentDocuments', () => ({ AgentDocumentModel: vi.fn() }));

const content = '---\nname: old-skill\ndescription: Historical skill\n---\n# Skill';
const bundle = {
  agentId: 'agent-1',
  id: 'bundle',
  documentId: 'bundle-doc',
  filename: 'old-skill',
  fileType: 'skills/bundle',
  parentId: null,
};
const index = {
  agentId: 'agent-1',
  id: 'index',
  documentId: 'index-doc',
  filename: 'SKILL.md',
  fileType: 'skills/index',
  parentId: 'bundle-doc',
  content,
};
const createService = () => {
  const agentDocumentModel = {
    create: vi.fn(),
    createWithTx: vi.fn(),
    convertAgentDocumentToSkillIndex: vi.fn(),
    convertAgentDocumentToSkillIndexWithTx: vi.fn(),
    findByDocumentId: vi.fn(async () => bundle),
    findById: vi.fn(async () => bundle),
    listByParent: vi.fn(async (_agentId: string, parentId: string | null) =>
      parentId ? [index] : [bundle],
    ),
    listByParentAndFilename: vi.fn(async (_agentId: string, parentId: string | null) =>
      parentId ? [index] : [bundle],
    ),
    update: vi.fn(),
    updateDocumentIdentity: vi.fn(),
  };
  const documentService = { getDocumentById: vi.fn(), trySaveCurrentDocumentHistory: vi.fn() };
  const service = new SkillManagementDocumentService({} as never, 'user-1', undefined, {
    agentDocumentModel: agentDocumentModel as never,
    documentService,
  });
  return { agentDocumentModel, documentService, service };
};

describe('SkillManagementDocumentService retirement', () => {
  it('rejects creation, conversion, replacement and rename before persistence', async () => {
    const { agentDocumentModel, documentService, service } = createService();
    const input = {
      agentId: 'agent-1',
      bodyMarkdown: '# Skill',
      description: 'Historical skill',
      name: 'old-skill',
      title: 'Old skill',
    };
    await expect(service.createSkill(input)).rejects.toThrow(
      'Platform skill production has been retired',
    );
    await expect(
      service.createSkill({ ...input, sourceAgentDocumentId: 'ordinary-document' }),
    ).rejects.toThrow('Platform skill production has been retired');
    await expect(service.replaceSkillIndex(input)).rejects.toThrow(
      'Platform skill production has been retired',
    );
    await expect(
      service.renameSkill({ agentId: 'agent-1', name: 'old-skill', newName: 'new-skill' }),
    ).rejects.toThrow('Platform skill production has been retired');
    expect(agentDocumentModel.createWithTx).not.toHaveBeenCalled();
    expect(agentDocumentModel.update).not.toHaveBeenCalled();
    expect(documentService.trySaveCurrentDocumentHistory).not.toHaveBeenCalled();
  });

  it('keeps historical skill content and stable document references readable', async () => {
    const { service } = createService();
    expect(await service.listSkills({ agentId: 'agent-1' })).toEqual([
      expect.objectContaining({ name: 'old-skill' }),
    ]);
    expect(
      await service.getSkill({ agentId: 'agent-1', name: 'old-skill', includeContent: true }),
    ).toMatchObject({ content, index: { documentId: 'index-doc' } });
    expect(
      await service.readSkillTargetSnapshot({ agentId: 'agent-1', agentDocumentId: 'bundle' }),
    ).toMatchObject({ writable: false });
  });
});
