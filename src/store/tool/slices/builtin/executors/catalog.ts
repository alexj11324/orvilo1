import { agentBuilderExecutor } from '@orvilo/builtin-tool-agent-builder/executor';
import { agentManagementExecutor } from '@orvilo/builtin-tool-agent-management/executor';
import { auvExecutor } from '@orvilo/builtin-tool-auv/client/executor';
import { calculatorExecutor } from '@orvilo/builtin-tool-calculator/executor';
import { cloudSandboxExecutor } from '@orvilo/builtin-tool-cloud-sandbox/executor';
import { credsExecutor } from '@orvilo/builtin-tool-creds/executor';
import { goalExecutor } from '@orvilo/builtin-tool-goal/client/executor';
import { groupAgentBuilderExecutor } from '@orvilo/builtin-tool-group-agent-builder/executor';
import { groupManagementExecutor } from '@orvilo/builtin-tool-group-management/executor';
import { imageGenerationExecutor } from '@orvilo/builtin-tool-image-generation/executor';
import { knowledgeBaseExecutor } from '@orvilo/builtin-tool-knowledge-base/client/executor';
import { memoryExecutor } from '@orvilo/builtin-tool-memory/executor';
import { orviloAgentExecutor } from '@orvilo/builtin-tool-orvilo-agent/client/executor';
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
import { localSystemExecutorWithGitEffects } from './localSystem';
import { activatorExecutor } from './orvilo-activator';
import { agentDocumentsExecutor } from './orvilo-agent-documents';
import { messageExecutor } from './orvilo-message';
import { notebookExecutor } from './orvilo-notebook';
import { pageAgentExecutor } from './orvilo-page-agent';
import { skillsExecutor } from './orvilo-skills';
import { topicReferenceExecutor } from './orvilo-topic-reference';
import { userInteractionExecutor } from './orvilo-user-interaction';
import { webBrowsing } from './orvilo-web-browsing';
import { webOnboardingExecutor } from './orvilo-web-onboarding';

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
  localSystemExecutorWithGitEffects,
  memoryExecutor,
  messageExecutor,
  notebookExecutor,
  pageAgentExecutor,
  skillsExecutor,
  taskExecutor,
  activatorExecutor,
  topicReferenceExecutor,
  userInteractionExecutor,
  orviloAgentExecutor,
  webOnboardingExecutor,
  webBrowsing,
] satisfies IBuiltinToolExecutor[];
