import { agentBuilderExecutor } from '@orvilo/builtin-tool-agent-builder/executor';
import { agentManagementExecutor } from '@orvilo/builtin-tool-agent-management/executor';
import { auvExecutor } from '@orvilo/builtin-tool-auv/client/executor';
import { browserExecutor } from '@orvilo/builtin-tool-browser/client/executor';
import { calculatorExecutor } from '@orvilo/builtin-tool-calculator/executor';
import { cloudSandboxExecutor } from '@orvilo/builtin-tool-cloud-sandbox/executor';
import { credsExecutor } from '@orvilo/builtin-tool-creds/executor';
import { goalExecutor } from '@orvilo/builtin-tool-goal/client/executor';
import { groupAgentBuilderExecutor } from '@orvilo/builtin-tool-group-agent-builder/executor';
import { groupManagementExecutor } from '@orvilo/builtin-tool-group-management/executor';
import { imageGenerationExecutor } from '@orvilo/builtin-tool-image-generation/executor';
import { knowledgeBaseExecutor } from '@orvilo/builtin-tool-knowledge-base/client/executor';
import { lobeAgentExecutor } from '@orvilo/builtin-tool-lobe-agent/client/executor';
import { memoryExecutor } from '@orvilo/builtin-tool-memory/executor';
import { taskExecutor } from '@orvilo/builtin-tool-task/client/executor';

import type { IBuiltinToolExecutor } from '../types';
import {
  ampExecutor,
  claudeCodeExecutor,
  codeBuddyExecutor,
  codexExecutor,
  cursorExecutor,
  devinExecutor,
  droidExecutor,
  grokBuildExecutor,
  kimiCodeExecutor,
  openCodeExecutor,
  piExecutor,
  qoderExecutor,
  traeExecutor,
} from './heteroCli';
import { activatorExecutor } from './lobe-activator';
import { agentDocumentsExecutor } from './lobe-agent-documents';
import { messageExecutor } from './lobe-message';
import { notebookExecutor } from './lobe-notebook';
import { pageAgentExecutor } from './lobe-page-agent';
import { skillStoreExecutor } from './lobe-skill-store';
import { skillsExecutor } from './lobe-skills';
import { topicReferenceExecutor } from './lobe-topic-reference';
import { userInteractionExecutor } from './lobe-user-interaction';
import { webBrowsing } from './lobe-web-browsing';
import { webOnboardingExecutor } from './lobe-web-onboarding';
import { localSystemExecutorWithGitEffects } from './localSystem';

export const builtinToolExecutors = [
  // Hook-only executors for heterogeneous CLI agents —
  // observe their shell tool results via `onAfterCall` (never invoked).
  ampExecutor,
  claudeCodeExecutor,
  codeBuddyExecutor,
  codexExecutor,
  cursorExecutor,
  droidExecutor,
  devinExecutor,
  grokBuildExecutor,
  kimiCodeExecutor,
  openCodeExecutor,
  piExecutor,
  qoderExecutor,
  traeExecutor,
  agentBuilderExecutor,
  agentDocumentsExecutor,
  agentManagementExecutor,
  auvExecutor,
  calculatorExecutor,
  cloudSandboxExecutor,
  credsExecutor,
  groupAgentBuilderExecutor,
  groupManagementExecutor,
  goalExecutor,
  imageGenerationExecutor,
  knowledgeBaseExecutor,
  browserExecutor,
  localSystemExecutorWithGitEffects,
  memoryExecutor,
  messageExecutor,
  notebookExecutor,
  pageAgentExecutor,
  skillStoreExecutor,
  skillsExecutor,
  taskExecutor,
  activatorExecutor,
  topicReferenceExecutor,
  userInteractionExecutor,
  lobeAgentExecutor,
  webOnboardingExecutor,
  webBrowsing,
] satisfies IBuiltinToolExecutor[];
