import { AcceptanceEvidenceManifest } from '@orvilo/builtin-tool-acceptance-evidence';
import { OrviloActivatorManifest } from '@orvilo/builtin-tool-activator';
import { AgentBuilderManifest } from '@orvilo/builtin-tool-agent-builder';
import { AgentDocumentsManifest } from '@orvilo/builtin-tool-agent-documents';
import { AgentManagementManifest } from '@orvilo/builtin-tool-agent-management';
import {
  agentSignalFeedbackIntentManifest,
  agentSignalReflectionManifest,
  agentSignalReviewManifest,
  agentSignalSkillManagementManifest,
} from '@orvilo/builtin-tool-agent-signal';
import { AuvManifest } from '@orvilo/builtin-tool-auv';
import { CalculatorManifest } from '@orvilo/builtin-tool-calculator/manifest';
import { CloudSandboxManifest } from '@orvilo/builtin-tool-cloud-sandbox';
import { CredsManifest } from '@orvilo/builtin-tool-creds';
import { GoalManifest, GoalSupervisorManifest } from '@orvilo/builtin-tool-goal';
import { GroupAgentBuilderManifest } from '@orvilo/builtin-tool-group-agent-builder';
import { GroupManagementManifest } from '@orvilo/builtin-tool-group-management';
import { ImageGenerationManifest } from '@orvilo/builtin-tool-image-generation';
import { KnowledgeBaseManifest } from '@orvilo/builtin-tool-knowledge-base';
import { LocalSystemManifest } from '@orvilo/builtin-tool-local-system';
import { MemoryManifest } from '@orvilo/builtin-tool-memory';
import { NotebookManifest } from '@orvilo/builtin-tool-notebook';
import { OrviloAgentManifest } from '@orvilo/builtin-tool-orvilo-agent';
import { PageAgentManifest } from '@orvilo/builtin-tool-page-agent';
import { selfFeedbackIntentManifest } from '@orvilo/builtin-tool-self-iteration';
import { SkillStoreManifest } from '@orvilo/builtin-tool-skill-store';
import { SkillsManifest } from '@orvilo/builtin-tool-skills';
import { TopicReferenceManifest } from '@orvilo/builtin-tool-topic-reference';
import { UserInteractionManifest } from '@orvilo/builtin-tool-user-interaction';
import { VerifyToolManifest } from '@orvilo/builtin-tool-verify';
import { WebBrowsingManifest } from '@orvilo/builtin-tool-web-browsing';
import { WebOnboardingManifest } from '@orvilo/builtin-tool-web-onboarding';

export const builtinToolIdentifiers: string[] = [
  AcceptanceEvidenceManifest.identifier,
  AgentBuilderManifest.identifier,
  AgentDocumentsManifest.identifier,
  AgentManagementManifest.identifier,
  AuvManifest.identifier,
  CalculatorManifest.identifier,
  CloudSandboxManifest.identifier,
  CredsManifest.identifier,
  GroupAgentBuilderManifest.identifier,
  GroupManagementManifest.identifier,
  GoalManifest.identifier,
  GoalSupervisorManifest.identifier,
  ImageGenerationManifest.identifier,
  KnowledgeBaseManifest.identifier,
  LocalSystemManifest.identifier,
  MemoryManifest.identifier,
  NotebookManifest.identifier,
  PageAgentManifest.identifier,
  selfFeedbackIntentManifest.identifier,
  agentSignalReviewManifest.identifier,
  agentSignalReflectionManifest.identifier,
  agentSignalFeedbackIntentManifest.identifier,
  agentSignalSkillManagementManifest.identifier,
  SkillsManifest.identifier,
  SkillStoreManifest.identifier,
  TopicReferenceManifest.identifier,
  OrviloActivatorManifest.identifier,
  WebBrowsingManifest.identifier,
  UserInteractionManifest.identifier,
  OrviloAgentManifest.identifier,
  WebOnboardingManifest.identifier,
  VerifyToolManifest.identifier,
];
