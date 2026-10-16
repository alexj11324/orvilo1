import { describe, expect, it } from 'vitest';

import { activatorRuntime } from '../activator';
import { agentBuilderRuntime } from '../agentBuilder';
import { agentDocumentsRuntime } from '../agentDocuments';
import { agentManagementRuntime } from '../agentManagement';
import { agentSignalFeedbackIntentRuntime } from '../agentSignalFeedbackIntent';
import { agentSignalReflectionRuntime } from '../agentSignalReflection';
import { agentSignalReviewRuntime } from '../agentSignalReview';
import { auvRuntime } from '../auv';
import { briefRuntime } from '../brief';
import { calculatorRuntime } from '../calculator';
import { cloudSandboxRuntime } from '../cloudSandbox';
import { credsRuntime } from '../creds';
import { groupAgentBuilderRuntime } from '../groupAgentBuilder';
import { groupManagementRuntime } from '../groupManagement';
import { getServerRuntime, getServerRuntimeIdentifiers, hasServerRuntime } from '../index';
import { knowledgeBaseRuntime } from '../knowledgeBase';
import { localSystemRuntime } from '../localSystem';
import { memoryRuntime } from '../memory';
import { notebookRuntime } from '../notebook';
import { orviloAgentRuntime } from '../orviloAgent';
import { pageAgentRuntime } from '../pageAgent';
import { remoteDeviceRuntime } from '../remoteDevice';
import { selfFeedbackIntentRuntime } from '../selfFeedbackIntent';
import { skillsRuntime } from '../skills';
import { taskRuntime } from '../task';
import { topicReferenceRuntime } from '../topicReference';
import { userInteractionRuntime } from '../userInteraction';
import { webBrowsingRuntime } from '../webBrowsing';
import { webOnboardingRuntime } from '../webOnboarding';

// The registry's loader map keys must equal the identifiers inside each
// module's registration — a drifted key would make `hasServerRuntime` answer
// for the wrong tool. Keep this list in sync with `index.ts`'s loaders.
const ALL_REGISTRATIONS = [
  activatorRuntime,
  agentBuilderRuntime,
  agentDocumentsRuntime,
  agentManagementRuntime,
  agentSignalFeedbackIntentRuntime,
  agentSignalReflectionRuntime,
  agentSignalReviewRuntime,
  auvRuntime,
  briefRuntime,
  calculatorRuntime,
  cloudSandboxRuntime,
  credsRuntime,
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
  skillsRuntime,
  taskRuntime,
  topicReferenceRuntime,
  userInteractionRuntime,
  webBrowsingRuntime,
  webOnboardingRuntime,
];

describe('serverRuntimes registry', () => {
  it.each(['orvilo-goal', 'orvilo-goal-supervisor', 'orvilo-verify', 'orvilo-acceptance-evidence'])(
    'does not execute the retired %s tool',
    async (identifier) => {
      expect(hasServerRuntime(identifier)).toBe(false);
      await expect(getServerRuntime(identifier, {} as never)).resolves.toBeUndefined();
    },
  );

  it('loader keys exactly cover the registered identifiers', () => {
    const registrationIds = ALL_REGISTRATIONS.map((r) => r.identifier).sort();
    expect(getServerRuntimeIdentifiers().sort()).toEqual(registrationIds);
    for (const identifier of registrationIds) {
      expect(hasServerRuntime(identifier)).toBe(true);
    }
    expect(hasServerRuntime('not-a-real-tool')).toBe(false);
    expect(hasServerRuntime('agent-signal-skill-management')).toBe(false);
    expect(hasServerRuntime('orvilo-skill-management')).toBe(false);
  });
});
