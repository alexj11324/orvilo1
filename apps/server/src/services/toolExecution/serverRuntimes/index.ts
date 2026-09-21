/**
 * Server Runtime Registry
 *
 * Central registry for all builtin tool server runtimes.
 * Uses factory functions to support both:
 * - Pre-instantiated runtimes (e.g., WebBrowsing - no per-request context needed)
 * - Per-request runtimes (e.g., CloudSandbox - needs topicId, userId)
 *
 * Runtime modules are loaded lazily per identifier: several of them
 * (goal / goalSupervisor / task / ...) import service-layer modules that reach
 * back into `services/aiAgent`, so static imports here would close an import
 * cycle (`aiAgent → runToolSurface → serverRuntimes → goal → aiAgent`). Keeping
 * this module a leaf in the static graph keeps `lint:circular` clean. The map
 * keys are the registration identifiers — `__tests__/registry.test.ts` asserts
 * each loaded module's `identifier` matches its key.
 */

import type { ToolExecutionContext } from '../types';
import type { ServerRuntimeRegistration } from './types';

const runtimeLoaders: Record<string, () => Promise<ServerRuntimeRegistration>> = {
  'agent-signal-feedback-intent': async () =>
    (await import('./agentSignalFeedbackIntent')).agentSignalFeedbackIntentRuntime,
  'agent-signal-reflection': async () =>
    (await import('./agentSignalReflection')).agentSignalReflectionRuntime,
  'agent-signal-review': async () => (await import('./agentSignalReview')).agentSignalReviewRuntime,
  'agent-signal-skill-management': async () =>
    (await import('./agentSignalSkillManagement')).agentSignalSkillManagementRuntime,
  'orvilo-acceptance-evidence': async () =>
    (await import('./acceptanceEvidence')).acceptanceEvidenceRuntime,
  'orvilo-activator': async () => (await import('./activator')).activatorRuntime,
  'orvilo-agent': async () => (await import('./orviloAgent')).orviloAgentRuntime,
  'orvilo-agent-builder': async () => (await import('./agentBuilder')).agentBuilderRuntime,
  'orvilo-agent-documents': async () => (await import('./agentDocuments')).agentDocumentsRuntime,
  'orvilo-agent-management': async () => (await import('./agentManagement')).agentManagementRuntime,
  'orvilo-brief': async () => (await import('./brief')).briefRuntime,
  'orvilo-calculator': async () => (await import('./calculator')).calculatorRuntime,
  'orvilo-cloud-sandbox': async () => (await import('./cloudSandbox')).cloudSandboxRuntime,
  'orvilo-computer-use': async () => (await import('./auv')).auvRuntime,
  'orvilo-creds': async () => (await import('./creds')).credsRuntime,
  'orvilo-goal': async () => (await import('./goal')).goalRuntime,
  'orvilo-goal-supervisor': async () => (await import('./goalSupervisor')).goalSupervisorRuntime,
  'orvilo-group-agent-builder': async () =>
    (await import('./groupAgentBuilder')).groupAgentBuilderRuntime,
  'orvilo-group-management': async () => (await import('./groupManagement')).groupManagementRuntime,
  'orvilo-image-generation': async () => (await import('./imageGeneration')).imageGenerationRuntime,
  'orvilo-knowledge-base': async () => (await import('./knowledgeBase')).knowledgeBaseRuntime,
  'orvilo-local-system': async () => (await import('./localSystem')).localSystemRuntime,
  'orvilo-notebook': async () => (await import('./notebook')).notebookRuntime,
  'orvilo-page-agent': async () => (await import('./pageAgent')).pageAgentRuntime,
  'orvilo-remote-device': async () => (await import('./remoteDevice')).remoteDeviceRuntime,
  'orvilo-self-feedback-intent': async () =>
    (await import('./selfFeedbackIntent')).selfFeedbackIntentRuntime,
  'orvilo-skill-maintainer': async () => (await import('./skillManagement')).skillManagementRuntime,
  'orvilo-skills': async () => (await import('./skills')).skillsRuntime,
  'orvilo-topic-reference': async () => (await import('./topicReference')).topicReferenceRuntime,
  'orvilo-user-interaction': async () => (await import('./userInteraction')).userInteractionRuntime,
  'orvilo-user-memory': async () => (await import('./memory')).memoryRuntime,
  'orvilo-verify': async () => (await import('./verifyResult')).verifyResultRuntime,
  'orvilo-web-browsing': async () => (await import('./webBrowsing')).webBrowsingRuntime,
  'orvilo-web-onboarding': async () => (await import('./webOnboarding')).webOnboardingRuntime,
  'orvilo-task': async () => (await import('./task')).taskRuntime,
};

// ==================== Registry API ====================

/**
 * Get a server runtime by identifier
 * @param identifier - The tool identifier
 * @param context - Execution context (required for per-request runtimes)
 * @returns Runtime instance (may be a Promise for async factories)
 */
export const getServerRuntime = async (
  identifier: string,
  context: ToolExecutionContext,
): Promise<any> => {
  const load = runtimeLoaders[identifier];
  if (!load) return undefined;
  return (await load()).factory(context);
};

/**
 * Check if a server runtime exists for the given identifier
 */
export const hasServerRuntime = (identifier: string): boolean => {
  return identifier in runtimeLoaders;
};

/**
 * Get all registered server runtime identifiers
 */
export const getServerRuntimeIdentifiers = (): string[] => {
  return Object.keys(runtimeLoaders);
};
