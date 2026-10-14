import { AgentDocumentVfsError } from '@/server/services/agentDocumentVfs/errors';

import type {
  CreateSkillInput,
  DeleteSkillInput,
  SkillMountProviderRequest,
  UpdateSkillInput,
  WritableSkillMountProvider,
} from '../SkillMount';
import type { SkillMountNode } from '../types';
import type { ProviderSkillsAgentDocumentDeps } from './providerSkillsAgentDocumentUtils';
import {
  assertSkillDocument,
  buildSkillDirectoryNode,
  buildSkillFileNode,
  buildSkillNamespaceRootNode,
  getResolvedSkillName,
  getScopedSkillDocuments,
  getSkillBundle,
  getSkillFile,
  listScopedSkillBundles,
  projectDocumentContent,
  sortSkillFolders,
} from './providerSkillsAgentDocumentUtils';

interface ProviderSkillsAgentDocumentConfig {
  namespace: 'agent';
}

const DOCUMENT_SKILL_PROVIDER_CONFIGS = {
  agent: {
    namespace: 'agent',
  },
} as const satisfies Record<'agent', ProviderSkillsAgentDocumentConfig>;

/**
 * Provides historical reads for retired document-backed platform skills.
 *
 * Use when:
 * - Serving agent-level skills from agent documents.
 *
 * Expects:
 * - Managed skill documents use `skills/bundle` parent rows and `skills/index` SKILL.md child rows.
 *
 * Returns:
 * - Skill VFS nodes whose paths use the target unified `./orvilo/skills/...` layout.
 */
export class ProviderSkillsAgentDocument implements WritableSkillMountProvider {
  private readonly config: ProviderSkillsAgentDocumentConfig;

  constructor(
    namespace: ProviderSkillsAgentDocumentConfig['namespace'],
    private readonly deps: ProviderSkillsAgentDocumentDeps,
  ) {
    this.config = DOCUMENT_SKILL_PROVIDER_CONFIGS[namespace];
  }

  async get(input: SkillMountProviderRequest): Promise<SkillMountNode> {
    if (!input.resolvedPath.skillName) {
      return buildSkillNamespaceRootNode(this.config.namespace);
    }

    const skillName = getResolvedSkillName(
      input.resolvedPath.skillName,
      input.resolvedPath.filePath,
    );
    const documents = await this.deps.agentDocumentModel.findByAgent(input.agentId);

    if (!input.resolvedPath.filePath) {
      assertSkillDocument(getSkillBundle(documents, this.config.namespace, skillName));
      return buildSkillDirectoryNode(this.config.namespace, skillName);
    }

    const document = assertSkillDocument(getSkillFile(documents, this.config.namespace, skillName));
    const content = await projectDocumentContent(document);

    return buildSkillFileNode({
      content,
      namespace: this.config.namespace,
      skillName,
    });
  }

  async list(input: SkillMountProviderRequest): Promise<SkillMountNode[]> {
    const documents = getScopedSkillDocuments(
      await this.deps.agentDocumentModel.findByAgent(input.agentId),
      this.config.namespace,
    );

    if (!input.resolvedPath.skillName) {
      return sortSkillFolders(listScopedSkillBundles(documents, this.config.namespace)).map(
        (document) => buildSkillDirectoryNode(this.config.namespace, document.filename),
      );
    }

    const skillName = getResolvedSkillName(
      input.resolvedPath.skillName,
      input.resolvedPath.filePath,
    );
    assertSkillDocument(getSkillBundle(documents, this.config.namespace, skillName));

    return [
      buildSkillFileNode({
        namespace: this.config.namespace,
        skillName,
      }),
    ];
  }

  async create(_input: CreateSkillInput): Promise<SkillMountNode> {
    throw new AgentDocumentVfsError('Platform skill production has been retired', 'FORBIDDEN');
  }

  async update(_input: UpdateSkillInput): Promise<SkillMountNode> {
    throw new AgentDocumentVfsError('Platform skill production has been retired', 'FORBIDDEN');
  }

  async delete(_input: DeleteSkillInput): Promise<void> {
    throw new AgentDocumentVfsError('Platform skill production has been retired', 'FORBIDDEN');
  }
}
