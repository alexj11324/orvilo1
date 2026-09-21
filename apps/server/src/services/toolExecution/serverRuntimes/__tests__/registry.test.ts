import { describe, expect, it } from 'vitest';

import { acceptanceEvidenceRuntime } from '../acceptanceEvidence';
import { activatorRuntime } from '../activator';
import { agentBuilderRuntime } from '../agentBuilder';
import { agentDocumentsRuntime } from '../agentDocuments';
import { agentManagementRuntime } from '../agentManagement';
import { agentSignalFeedbackIntentRuntime } from '../agentSignalFeedbackIntent';
import { agentSignalReflectionRuntime } from '../agentSignalReflection';
import { agentSignalReviewRuntime } from '../agentSignalReview';
import { agentSignalSkillManagementRuntime } from '../agentSignalSkillManagement';
import { auvRuntime } from '../auv';
import { briefRuntime } from '../brief';
import { calculatorRuntime } from '../calculator';
import { cloudSandboxRuntime } from '../cloudSandbox';
import { credsRuntime } from '../creds';
import { goalRuntime } from '../goal';
import { goalSupervisorRuntime } from '../goalSupervisor';
import { groupAgentBuilderRuntime } from '../groupAgentBuilder';
import { groupManagementRuntime } from '../groupManagement';
import { getServerRuntimeIdentifiers, hasServerRuntime } from '../index';
import { knowledgeBaseRuntime } from '../knowledgeBase';
import { localSystemRuntime } from '../localSystem';
import { memoryRuntime } from '../memory';
import { notebookRuntime } from '../notebook';
import { orviloAgentRuntime } from '../orviloAgent';
import { pageAgentRuntime } from '../pageAgent';
import { remoteDeviceRuntime } from '../remoteDevice';
import { selfFeedbackIntentRuntime } from '../selfFeedbackIntent';
import { skillManagementRuntime } from '../skillManagement';
import { skillsRuntime } from '../skills';
import { taskRuntime } from '../task';
import { topicReferenceRuntime } from '../topicReference';
import { userInteractionRuntime } from '../userInteraction';
import { verifyResultRuntime } from '../verifyResult';
import { webBrowsingRuntime } from '../webBrowsing';
import { webOnboardingRuntime } from '../webOnboarding';

// The registry's loader map keys must equal the identifiers inside each
// module's registration — a drifted key would make `hasServerRuntime` answer
// for the wrong tool. Keep this list in sync with `index.ts`'s loaders.
const ALL_REGISTRATIONS = [
  acceptanceEvidenceRuntime,
  activatorRuntime,
  agentBuilderRuntime,
  agentDocumentsRuntime,
  agentManagementRuntime,
  agentSignalFeedbackIntentRuntime,
  agentSignalReflectionRuntime,
  agentSignalReviewRuntime,
  agentSignalSkillManagementRuntime,
  auvRuntime,
  briefRuntime,
  calculatorRuntime,
  cloudSandboxRuntime,
  credsRuntime,
  goalRuntime,
  goalSupervisorRuntime,
  groupAgentBuilderRuntime,
  groupManagementRuntime,
  knowledgeBaseRuntime,
  localSystemRuntime,
  memoryRuntime,
  notebookRuntime,
  orviloAgentRuntime,
  pageAgentRuntime,
  remoteDeviceRuntime,
  selfFeedbackIntentRuntime,
  skillManagementRuntime,
  skillsRuntime,
  taskRuntime,
  topicReferenceRuntime,
  userInteractionRuntime,
  verifyResultRuntime,
  webBrowsingRuntime,
  webOnboardingRuntime,
];

describe('serverRuntimes registry', () => {
  it('loader keys exactly cover the registered identifiers', () => {
    const registrationIds = ALL_REGISTRATIONS.map((r) => r.identifier).sort();
    expect(getServerRuntimeIdentifiers().sort()).toEqual(registrationIds);
    for (const identifier of registrationIds) {
      expect(hasServerRuntime(identifier)).toBe(true);
    }
    expect(hasServerRuntime('not-a-real-tool')).toBe(false);
  });
});
