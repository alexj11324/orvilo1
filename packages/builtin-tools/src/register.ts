import {
  OrviloActivatorInspectors,
  OrviloActivatorManifest,
  OrviloActivatorRenders,
} from '@orvilo/builtin-tool-activator/client';
import {
  AgentBuilderInspectors,
  AgentBuilderInterventions,
  AgentBuilderManifest,
  AgentBuilderRenders,
  AgentBuilderStreamings,
} from '@orvilo/builtin-tool-agent-builder/client';
import {
  AgentDocumentsInspectors,
  AgentDocumentsManifest,
  AgentDocumentsRenders,
  AgentDocumentsStreamings,
} from '@orvilo/builtin-tool-agent-documents/client';
import {
  AgentManagementInspectors,
  AgentManagementManifest,
  AgentManagementRenders,
  AgentManagementStreamings,
} from '@orvilo/builtin-tool-agent-management/client';
import { AuvIdentifier, AuvInspectors } from '@orvilo/builtin-tool-auv/client';
import {
  ClaudeCodeApiName,
  ClaudeCodeIdentifier,
  ClaudeCodeInspectors,
  ClaudeCodeInterventions,
  ClaudeCodeRenders,
  ClaudeCodeStreamings,
} from '@orvilo/builtin-tool-claude-code/client';
import {
  CloudSandboxInspectors,
  CloudSandboxInterventions,
  CloudSandboxManifest,
  CloudSandboxRenders,
  CloudSandboxStreamings,
} from '@orvilo/builtin-tool-cloud-sandbox/client';
import {
  GoalInspectors,
  GoalInterventions,
  GoalManifest,
  GoalRenders,
  GoalSupervisorInspectors,
  GoalSupervisorManifest,
} from '@orvilo/builtin-tool-goal/client';
import {
  GroupAgentBuilderInspectors,
  GroupAgentBuilderManifest,
  GroupAgentBuilderRenders,
  GroupAgentBuilderStreamings,
} from '@orvilo/builtin-tool-group-agent-builder/client';
import {
  GroupManagementInspectors,
  GroupManagementInterventions,
  GroupManagementManifest,
  GroupManagementRenders,
  GroupManagementStreamings,
} from '@orvilo/builtin-tool-group-management/client';
import {
  ImageGenerationInspectors,
  ImageGenerationManifest,
  ImageGenerationRenders,
} from '@orvilo/builtin-tool-image-generation/client';
import {
  KnowledgeBaseInspectors,
  KnowledgeBaseManifest,
  KnowledgeBaseRenders,
} from '@orvilo/builtin-tool-knowledge-base/client';
import {
  LocalSystemApiName,
  LocalSystemIdentifier,
  LocalSystemInspectors,
  LocalSystemInterventions,
  LocalSystemListFilesPlaceholder,
  LocalSystemManifest,
  LocalSystemRenders,
  LocalSystemSearchFilesPlaceholder,
  LocalSystemStreamings,
} from '@orvilo/builtin-tool-local-system/client';
import {
  MemoryInspectors,
  MemoryInterventions,
  MemoryManifest,
  MemoryRenders,
  MemoryStreamings,
} from '@orvilo/builtin-tool-memory/client';
import {
  OrviloAgentInspectors,
  OrviloAgentInterventions,
  OrviloAgentManifest,
  OrviloAgentRenders,
  OrviloAgentStreamings,
} from '@orvilo/builtin-tool-orvilo-agent/client';
import {
  PageAgentInspectors,
  PageAgentManifest,
  PageAgentRenders,
  PageAgentStreamings,
} from '@orvilo/builtin-tool-page-agent/client';
import {
  RemoteDeviceInspectors,
  RemoteDeviceManifest,
  RemoteDeviceRenders,
} from '@orvilo/builtin-tool-remote-device/client';
import {
  SelfFeedbackIntentInspectors,
  selfFeedbackIntentManifest,
} from '@orvilo/builtin-tool-self-iteration/client';
import {
  SkillsInspectors,
  SkillsManifest,
  SkillsRenders,
} from '@orvilo/builtin-tool-skills/client';
import {
  TaskInspectors,
  TaskInterventions,
  TaskManifest,
  TaskRenders,
} from '@orvilo/builtin-tool-task/client';
import {
  UserInteractionIdentifier,
  UserInteractionInspectors,
  UserInteractionInterventions,
  UserInteractionRenders,
} from '@orvilo/builtin-tool-user-interaction/client';
import {
  WebBrowsingInspectors,
  WebBrowsingManifest,
  WebBrowsingPlaceholders,
  WebBrowsingPortal,
  WebBrowsingPortalTitle,
  WebBrowsingRenders,
} from '@orvilo/builtin-tool-web-browsing/client';
import {
  WebOnboardingInspectors,
  WebOnboardingInterventions,
  WebOnboardingManifest,
  WebOnboardingRenders,
} from '@orvilo/builtin-tool-web-onboarding/client';
import {
  createReadLocalFileInspector,
  createRunCommandInspector,
  createWriteLocalFileInspector,
} from '@orvilo/shared-tool-ui/inspectors';
import { RunCommandRender } from '@orvilo/shared-tool-ui/renders';
import type {
  BuiltinInspector,
  BuiltinIntervention,
  BuiltinPlaceholder,
  BuiltinPortal,
  BuiltinPortalTitle,
  BuiltinRender,
  BuiltinStreaming,
} from '@orvilo/types';

import { BrowserIdentifier, BrowserRenders } from './browser';
import { CodexInspectors, CodexRenders } from './codex';
import { GithubIdentifier, GithubInspectors, GithubRenders } from './github';
import { registerBuiltinInspectors } from './inspectors';
import { registerBuiltinInterventions } from './interventions';
import { KimiCodeInspectors, KimiCodeRenders } from './kimiCode';
import { LinearIdentifier, LinearInspectors, LinearRenders } from './linear';
import { NotebookIdentifier, NotebookRenders } from './notebook';
import { registerBuiltinPlaceholders } from './placeholders';
import { registerBuiltinPortals } from './portals';
import { registerBuiltinRenders } from './renders';
import { registerBuiltinStreamings } from './streamings';
import { TwitterIdentifier, TwitterInspectors } from './twitter';

const DROID_IDENTIFIER = 'droid';
const DEVIN_IDENTIFIER = 'devin';
const QODER_IDENTIFIER = 'qoder';
const OPENCODE_IDENTIFIER = 'opencode';
const PI_IDENTIFIER = 'pi';
const KIMI_CODE_IDENTIFIER = 'kimi-code';
const AMP_IDENTIFIER = 'amp';
const CODEBUDDY_IDENTIFIER = 'codebuddy';
const CODEX_IDENTIFIER = 'codex';

/**
 * Standard-ACP providers whose permission/elicitation requests surface as
 * `askUserQuestion` tool calls stamped with the provider identifier — the
 * AskUserBridge reuses the Claude Code form for all of them.
 */
const STANDARD_ACP_ASK_USER_IDENTIFIERS = [
  AMP_IDENTIFIER,
  CODEBUDDY_IDENTIFIER,
  CODEX_IDENTIFIER,
  KIMI_CODE_IDENTIFIER,
  OPENCODE_IDENTIFIER,
  PI_IDENTIFIER,
];

/** Per-identifier apiName map carrying just the shared askUserQuestion surface. */
const standardAcpAskUserSurfaces = <T>(surface: T): Record<string, Record<string, T>> =>
  Object.fromEntries(
    STANDARD_ACP_ASK_USER_IDENTIFIERS.map((identifier) => [
      identifier,
      { [ClaudeCodeApiName.AskUserQuestion]: surface },
    ]),
  );

/** Merge the shared askUserQuestion surface into an identifier's existing apiName map. */
const withAskUserQuestion = <T>(surface: T, existing?: Record<string, T>): Record<string, T> => ({
  ...existing,
  [ClaudeCodeApiName.AskUserQuestion]: surface,
});

const askUserQuestionRender = ClaudeCodeRenders[ClaudeCodeApiName.AskUserQuestion] as BuiltinRender;
const askUserQuestionInspector = ClaudeCodeInspectors[
  ClaudeCodeApiName.AskUserQuestion
] as BuiltinInspector;

const heterogeneousCliInspectors: Record<string, BuiltinInspector> = {
  bash: createRunCommandInspector(
    'builtins.orvilo-local-system.apiName.runCommand',
  ) as BuiltinInspector,
  read: createReadLocalFileInspector(
    'builtins.orvilo-local-system.apiName.readFile',
  ) as BuiltinInspector,
  write: createWriteLocalFileInspector(
    'builtins.orvilo-local-system.apiName.writeFile',
  ) as BuiltinInspector,
};

const heterogeneousCliRenders: Record<string, BuiltinRender> = {
  bash: RunCommandRender as BuiltinRender,
  read: LocalSystemRenders[LocalSystemApiName.readFile] as BuiltinRender,
  write: LocalSystemRenders[LocalSystemApiName.writeFile] as BuiltinRender,
};

const heterogeneousCliStreamings: Record<string, BuiltinStreaming> = {
  bash: LocalSystemStreamings[LocalSystemApiName.runCommand] as BuiltinStreaming,
  write: LocalSystemStreamings[LocalSystemApiName.writeFile] as BuiltinStreaming,
};

let builtinToolSurfacesRegistered = false;

export const registerBuiltinToolSurfaces = (): void => {
  if (builtinToolSurfacesRegistered) return;

  registerBuiltinRenders({
    [AgentBuilderManifest.identifier]: AgentBuilderRenders as Record<string, BuiltinRender>,
    [AgentDocumentsManifest.identifier]: AgentDocumentsRenders as Record<string, BuiltinRender>,
    [AgentManagementManifest.identifier]: AgentManagementRenders as Record<string, BuiltinRender>,
    // Retired `orvilo-browser`: render-only registration so persisted
    // conversations keep displaying historical screenshots/page dumps.
    [BrowserIdentifier]: BrowserRenders,
    [ClaudeCodeIdentifier]: ClaudeCodeRenders as Record<string, BuiltinRender>,
    [DROID_IDENTIFIER]: {
      [ClaudeCodeApiName.AskUserQuestion]: ClaudeCodeRenders[ClaudeCodeApiName.AskUserQuestion],
    },
    [DEVIN_IDENTIFIER]: {
      [ClaudeCodeApiName.AskUserQuestion]: ClaudeCodeRenders[ClaudeCodeApiName.AskUserQuestion],
    },
    [QODER_IDENTIFIER]: ClaudeCodeRenders as Record<string, BuiltinRender>,
    [AMP_IDENTIFIER]: withAskUserQuestion(askUserQuestionRender),
    [CODEBUDDY_IDENTIFIER]: withAskUserQuestion(askUserQuestionRender),
    [CloudSandboxManifest.identifier]: CloudSandboxRenders as Record<string, BuiltinRender>,
    [GroupAgentBuilderManifest.identifier]: GroupAgentBuilderRenders as Record<
      string,
      BuiltinRender
    >,
    [GroupManagementManifest.identifier]: GroupManagementRenders as Record<string, BuiltinRender>,
    [GoalManifest.identifier]: GoalRenders as Record<string, BuiltinRender>,
    [ImageGenerationManifest.identifier]: ImageGenerationRenders as Record<string, BuiltinRender>,
    [KnowledgeBaseManifest.identifier]: KnowledgeBaseRenders as Record<string, BuiltinRender>,
    [OrviloAgentManifest.identifier]: OrviloAgentRenders as Record<string, BuiltinRender>,
    [LocalSystemManifest.identifier]: LocalSystemRenders as Record<string, BuiltinRender>,
    [MemoryManifest.identifier]: MemoryRenders as Record<string, BuiltinRender>,
    [NotebookIdentifier]: NotebookRenders,
    [PageAgentManifest.identifier]: PageAgentRenders as Record<string, BuiltinRender>,
    [RemoteDeviceManifest.identifier]: RemoteDeviceRenders as Record<string, BuiltinRender>,
    [SkillsManifest.identifier]: SkillsRenders as Record<string, BuiltinRender>,
    [TaskManifest.identifier]: TaskRenders as Record<string, BuiltinRender>,
    [UserInteractionIdentifier]: UserInteractionRenders as Record<string, BuiltinRender>,
    [OrviloActivatorManifest.identifier]: OrviloActivatorRenders as Record<string, BuiltinRender>,
    [WebBrowsingManifest.identifier]: WebBrowsingRenders as Record<string, BuiltinRender>,
    [WebOnboardingManifest.identifier]: WebOnboardingRenders as Record<string, BuiltinRender>,
    [OPENCODE_IDENTIFIER]: withAskUserQuestion(askUserQuestionRender, heterogeneousCliRenders),
    [PI_IDENTIFIER]: withAskUserQuestion(askUserQuestionRender, heterogeneousCliRenders),
    [KIMI_CODE_IDENTIFIER]: withAskUserQuestion(
      askUserQuestionRender,
      KimiCodeRenders as Record<string, BuiltinRender>,
    ),
    codex: withAskUserQuestion(askUserQuestionRender, {
      ...CodexRenders,
      command_execution: RunCommandRender as BuiltinRender,
    }),
    [GithubIdentifier]: GithubRenders,
    [LinearIdentifier]: LinearRenders,
  });

  registerBuiltinInspectors({
    [AuvIdentifier]: AuvInspectors as Record<string, BuiltinInspector>,
    // Read-only alias for messages recorded by the original private desktop PR.
    // New manifests and execution routes only advertise orvilo-computer-use.
    'orvilo-auv': AuvInspectors as Record<string, BuiltinInspector>,
    [AgentBuilderManifest.identifier]: AgentBuilderInspectors as Record<string, BuiltinInspector>,
    [AgentDocumentsManifest.identifier]: AgentDocumentsInspectors as Record<
      string,
      BuiltinInspector
    >,
    [AgentManagementManifest.identifier]: AgentManagementInspectors as Record<
      string,
      BuiltinInspector
    >,
    [ClaudeCodeIdentifier]: ClaudeCodeInspectors as Record<string, BuiltinInspector>,
    [DROID_IDENTIFIER]: {
      [ClaudeCodeApiName.AskUserQuestion]: ClaudeCodeInspectors[ClaudeCodeApiName.AskUserQuestion],
    },
    [DEVIN_IDENTIFIER]: {
      [ClaudeCodeApiName.AskUserQuestion]: ClaudeCodeInspectors[ClaudeCodeApiName.AskUserQuestion],
    },
    [QODER_IDENTIFIER]: ClaudeCodeInspectors as Record<string, BuiltinInspector>,
    [AMP_IDENTIFIER]: withAskUserQuestion(askUserQuestionInspector),
    [CODEBUDDY_IDENTIFIER]: withAskUserQuestion(askUserQuestionInspector),
    [CloudSandboxManifest.identifier]: CloudSandboxInspectors as Record<string, BuiltinInspector>,
    [GroupAgentBuilderManifest.identifier]: GroupAgentBuilderInspectors as Record<
      string,
      BuiltinInspector
    >,
    [GroupManagementManifest.identifier]: GroupManagementInspectors as Record<
      string,
      BuiltinInspector
    >,
    [GoalManifest.identifier]: GoalInspectors as Record<string, BuiltinInspector>,
    [GoalSupervisorManifest.identifier]: GoalSupervisorInspectors,
    [ImageGenerationManifest.identifier]: ImageGenerationInspectors as Record<
      string,
      BuiltinInspector
    >,
    [KnowledgeBaseManifest.identifier]: KnowledgeBaseInspectors as Record<string, BuiltinInspector>,
    [OrviloAgentManifest.identifier]: OrviloAgentInspectors as Record<string, BuiltinInspector>,
    [LocalSystemManifest.identifier]: LocalSystemInspectors as Record<string, BuiltinInspector>,
    [MemoryManifest.identifier]: MemoryInspectors as Record<string, BuiltinInspector>,
    [PageAgentManifest.identifier]: PageAgentInspectors as Record<string, BuiltinInspector>,
    [RemoteDeviceManifest.identifier]: RemoteDeviceInspectors as Record<string, BuiltinInspector>,
    [OrviloActivatorManifest.identifier]: OrviloActivatorInspectors as Record<
      string,
      BuiltinInspector
    >,
    [selfFeedbackIntentManifest.identifier]: SelfFeedbackIntentInspectors as Record<
      string,
      BuiltinInspector
    >,
    [SkillsManifest.identifier]: SkillsInspectors as Record<string, BuiltinInspector>,
    [TaskManifest.identifier]: TaskInspectors as Record<string, BuiltinInspector>,
    [UserInteractionIdentifier]: UserInteractionInspectors as Record<string, BuiltinInspector>,
    [WebBrowsingManifest.identifier]: WebBrowsingInspectors as Record<string, BuiltinInspector>,
    [WebOnboardingManifest.identifier]: WebOnboardingInspectors as Record<string, BuiltinInspector>,
    [OPENCODE_IDENTIFIER]: withAskUserQuestion(
      askUserQuestionInspector,
      heterogeneousCliInspectors,
    ),
    [PI_IDENTIFIER]: withAskUserQuestion(askUserQuestionInspector, heterogeneousCliInspectors),
    [KIMI_CODE_IDENTIFIER]: withAskUserQuestion(askUserQuestionInspector, KimiCodeInspectors),
    'codex': withAskUserQuestion(askUserQuestionInspector, CodexInspectors),
    [GithubIdentifier]: GithubInspectors,
    [LinearIdentifier]: LinearInspectors,
    [TwitterIdentifier]: TwitterInspectors,
  });

  registerBuiltinStreamings({
    [AgentBuilderManifest.identifier]: AgentBuilderStreamings as Record<string, BuiltinStreaming>,
    [AgentDocumentsManifest.identifier]: AgentDocumentsStreamings as Record<
      string,
      BuiltinStreaming
    >,
    [AgentManagementManifest.identifier]: AgentManagementStreamings as Record<
      string,
      BuiltinStreaming
    >,
    [ClaudeCodeIdentifier]: ClaudeCodeStreamings as Record<string, BuiltinStreaming>,
    [QODER_IDENTIFIER]: ClaudeCodeStreamings as Record<string, BuiltinStreaming>,
    [CloudSandboxManifest.identifier]: CloudSandboxStreamings as Record<string, BuiltinStreaming>,
    [GroupAgentBuilderManifest.identifier]: GroupAgentBuilderStreamings as Record<
      string,
      BuiltinStreaming
    >,
    [GroupManagementManifest.identifier]: GroupManagementStreamings as Record<
      string,
      BuiltinStreaming
    >,
    [OrviloAgentManifest.identifier]: OrviloAgentStreamings as Record<string, BuiltinStreaming>,
    [LocalSystemManifest.identifier]: LocalSystemStreamings as Record<string, BuiltinStreaming>,
    [MemoryManifest.identifier]: MemoryStreamings as Record<string, BuiltinStreaming>,
    [OPENCODE_IDENTIFIER]: heterogeneousCliStreamings,
    [PageAgentManifest.identifier]: PageAgentStreamings as Record<string, BuiltinStreaming>,
    [PI_IDENTIFIER]: heterogeneousCliStreamings,
  });

  registerBuiltinInterventions({
    [AgentBuilderManifest.identifier]: AgentBuilderInterventions as Record<
      string,
      BuiltinIntervention
    >,
    [ClaudeCodeIdentifier]: ClaudeCodeInterventions as Record<string, BuiltinIntervention>,
    [DROID_IDENTIFIER]: {
      [ClaudeCodeApiName.AskUserQuestion]:
        ClaudeCodeInterventions[ClaudeCodeApiName.AskUserQuestion],
    },
    [DEVIN_IDENTIFIER]: {
      [ClaudeCodeApiName.AskUserQuestion]:
        ClaudeCodeInterventions[ClaudeCodeApiName.AskUserQuestion],
    },
    [QODER_IDENTIFIER]: ClaudeCodeInterventions as Record<string, BuiltinIntervention>,
    ...standardAcpAskUserSurfaces(
      ClaudeCodeInterventions[ClaudeCodeApiName.AskUserQuestion] as BuiltinIntervention,
    ),
    [CloudSandboxManifest.identifier]: CloudSandboxInterventions as Record<
      string,
      BuiltinIntervention
    >,
    [GroupManagementManifest.identifier]: GroupManagementInterventions as Record<
      string,
      BuiltinIntervention
    >,
    [GoalManifest.identifier]: GoalInterventions as Record<string, BuiltinIntervention>,
    [OrviloAgentManifest.identifier]: OrviloAgentInterventions as Record<
      string,
      BuiltinIntervention
    >,
    [LocalSystemIdentifier]: LocalSystemInterventions as Record<string, BuiltinIntervention>,
    [MemoryManifest.identifier]: MemoryInterventions as Record<string, BuiltinIntervention>,
    [TaskManifest.identifier]: TaskInterventions as Record<string, BuiltinIntervention>,
    [UserInteractionIdentifier]: UserInteractionInterventions as Record<
      string,
      BuiltinIntervention
    >,
    [WebOnboardingManifest.identifier]: WebOnboardingInterventions as Record<
      string,
      BuiltinIntervention
    >,
  });

  registerBuiltinPlaceholders({
    [LocalSystemIdentifier]: {
      [LocalSystemApiName.searchFiles]: LocalSystemSearchFilesPlaceholder as BuiltinPlaceholder,
      [LocalSystemApiName.listFiles]: LocalSystemListFilesPlaceholder as BuiltinPlaceholder,
      // Legacy aliases — keep these so historical messages keep rendering.
      listLocalFiles: LocalSystemListFilesPlaceholder as BuiltinPlaceholder,
      searchLocalFiles: LocalSystemSearchFilesPlaceholder as BuiltinPlaceholder,
    },
    [WebBrowsingManifest.identifier]: WebBrowsingPlaceholders as Record<string, BuiltinPlaceholder>,
  });

  registerBuiltinPortals({
    portals: {
      [WebBrowsingManifest.identifier]: WebBrowsingPortal as BuiltinPortal,
    },
    titles: {
      [WebBrowsingManifest.identifier]: WebBrowsingPortalTitle as BuiltinPortalTitle,
    },
  });

  builtinToolSurfacesRegistered = true;
};
