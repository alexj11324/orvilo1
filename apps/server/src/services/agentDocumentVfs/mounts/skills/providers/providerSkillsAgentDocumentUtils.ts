import type { AgentDocument, PolicyLoad } from '@/database/models/agentDocuments';
import type { AgentDocumentSourceType } from '@/database/models/agentDocuments/types';
import { exportEditorDataSnapshot } from '@/server/services/agentDocuments/headlessEditor';
import { AgentDocumentVfsError } from '@/server/services/agentDocumentVfs/errors';
import {
  AGENT_SKILL_TEMPLATE_ID,
  SKILL_BUNDLE_FILE_TYPE,
  SKILL_INDEX_FILE_TYPE,
  SKILL_INDEX_FILENAME,
} from '@/server/services/skillManagement';

import { getUnifiedSkillNamespaceRootPath } from '../path';
import type { SkillMountNode } from '../types';

export interface AgentSkillDocumentModelLike {
  create: (
    agentId: string,
    filename: string,
    content: string,
    params?: {
      editorData?: Record<string, any>;
      fileType?: string;
      metadata?: Record<string, any>;
      parentId?: string | null;
      policyLoad?: PolicyLoad;
      source?: string;
      sourceType?: AgentDocumentSourceType;
      templateId?: string;
      title?: string;
    },
  ) => Promise<AgentDocument>;
  delete: (documentId: string, deleteReason?: string) => Promise<void>;
  deleteSubtreeByDocumentId: (
    agentId: string,
    rootDocumentId: string,
    deleteReason?: string,
  ) => Promise<void>;
  findByAgent: (agentId: string) => Promise<AgentDocument[]>;
  update: (
    documentId: string,
    params?: {
      content?: string;
      editorData?: Record<string, any>;
      metadata?: Record<string, any>;
      policyLoad?: PolicyLoad;
    },
  ) => Promise<void>;
}

export interface DocumentTreeServiceLike {
  trySaveCurrentDocumentHistory: (documentId: string, saveSource: 'llm_call') => Promise<unknown>;
}

export interface ProviderSkillsAgentDocumentDeps {
  agentDocumentModel: AgentSkillDocumentModelLike;
  documentService: DocumentTreeServiceLike;
}

export interface CreateSkillTreeInput {
  agentDocumentModel: AgentSkillDocumentModelLike;
  agentId: string;
  content: string;
  editorData: Record<string, any>;
  namespace: 'agent';
  skillName: string;
}

export const EMPTY_EDITOR_DATA = { root: { children: [], type: 'root' } };

export const SKILL_FILE_NAME = SKILL_INDEX_FILENAME;

export const buildSkillDirectoryNode = (
  namespace: Extract<SkillMountNode['namespace'], 'agent'>,
  skillName: string,
): SkillMountNode => ({
  name: skillName,
  namespace,
  path: `${getUnifiedSkillNamespaceRootPath(namespace)}/${skillName}`,
  readOnly: true,
  type: 'directory',
});

export const buildSkillNamespaceRootNode = (
  namespace: Extract<SkillMountNode['namespace'], 'agent'>,
): SkillMountNode => ({
  name: 'skills',
  namespace,
  path: getUnifiedSkillNamespaceRootPath(namespace),
  readOnly: true,
  type: 'directory',
});

export const buildSkillFileNode = ({
  content,
  namespace,
  skillName,
}: {
  content?: string;
  namespace: Extract<SkillMountNode['namespace'], 'agent'>;
  skillName: string;
}): SkillMountNode => ({
  ...(content !== undefined ? { content } : {}),
  contentType: 'text/markdown',
  name: SKILL_FILE_NAME,
  namespace,
  path: `${getUnifiedSkillNamespaceRootPath(namespace)}/${skillName}/${SKILL_FILE_NAME}`,
  readOnly: true,
  type: 'file',
});

export const getValidatedSkillName = (
  name: string,
  fieldName: 'skillName' | 'targetName',
): string => {
  const trimmed = name.trim();

  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    throw new AgentDocumentVfsError(
      `Invalid ${fieldName}: expected a non-empty single path segment`,
      'BAD_REQUEST',
    );
  }

  return trimmed;
};

export const getResolvedSkillName = (skillName?: string, filePath?: string) => {
  if (!skillName) {
    throw new AgentDocumentVfsError('Skill path must include a skill name', 'BAD_REQUEST');
  }

  if (filePath && filePath !== SKILL_FILE_NAME) {
    throw new AgentDocumentVfsError(`Unsupported skill file path "${filePath}"`, 'BAD_REQUEST');
  }

  return skillName;
};

export const projectDocumentContent = async (document: AgentDocument) => {
  if (document.fileType === SKILL_INDEX_FILE_TYPE) {
    return document.content;
  }

  try {
    const snapshot = await exportEditorDataSnapshot({
      editorData: document.editorData,
      fallbackContent: document.content,
    });

    if (snapshot.content.trim().length === 0 && document.content.trim().length > 0) {
      return document.content;
    }

    return snapshot.content;
  } catch {
    return document.content;
  }
};

export const isManagedSkillDocument = (document: Pick<AgentDocument, 'templateId'>) =>
  document.templateId === AGENT_SKILL_TEMPLATE_ID;

export const getScopedSkillDocuments = (documents: AgentDocument[], namespace: 'agent') =>
  namespace === 'agent' ? documents.filter(isManagedSkillDocument) : [];

export const getSkillBundle = (
  documents: AgentDocument[],
  namespace: 'agent',
  skillName: string,
) => {
  return getScopedSkillDocuments(documents, namespace).find(
    (document) =>
      document.fileType === SKILL_BUNDLE_FILE_TYPE &&
      document.filename === skillName &&
      document.parentId === null,
  );
};

export const getSkillFile = (documents: AgentDocument[], namespace: 'agent', skillName: string) => {
  const bundle = getSkillBundle(documents, namespace, skillName);
  if (!bundle) return undefined;

  return getScopedSkillDocuments(documents, namespace).find(
    (document) =>
      document.fileType === SKILL_INDEX_FILE_TYPE &&
      document.filename === SKILL_FILE_NAME &&
      document.parentId === bundle.documentId,
  );
};

export const listScopedSkillBundles = (documents: AgentDocument[], namespace: 'agent') =>
  getScopedSkillDocuments(documents, namespace).filter(
    (document) => document.fileType === SKILL_BUNDLE_FILE_TYPE && document.parentId === null,
  );

export const assertSkillDocument = <T>(document: T | undefined, message = 'Skill not found') => {
  if (!document) {
    throw new AgentDocumentVfsError(message, 'NOT_FOUND');
  }

  return document;
};

export const sortSkillFolders = (documents: AgentDocument[]) =>
  [...documents].sort((left, right) => left.filename.localeCompare(right.filename));

export const collectSubtreeBindings = (documents: AgentDocument[], rootDocumentId: string) => {
  const byParent = new Map<string, AgentDocument[]>();

  for (const document of documents) {
    if (!document.parentId) continue;

    const children = byParent.get(document.parentId) ?? [];
    children.push(document);
    byParent.set(document.parentId, children);
  }

  const collected: AgentDocument[] = [];
  const visit = (documentId: string) => {
    const children = byParent.get(documentId) ?? [];

    for (const child of children) {
      visit(child.documentId);
      collected.push(child);
    }
  };

  visit(rootDocumentId);

  const root = documents.find((document) => document.documentId === rootDocumentId);

  if (root) {
    collected.push(root);
  }

  return collected;
};
