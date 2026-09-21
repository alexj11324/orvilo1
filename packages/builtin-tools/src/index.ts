import { AcceptanceEvidenceManifest } from '@orvilo/builtin-tool-acceptance-evidence';
import { OrviloActivatorManifest } from '@orvilo/builtin-tool-activator';
import { AgentBuilderManifest } from '@orvilo/builtin-tool-agent-builder';
import { AgentDocumentsManifest } from '@orvilo/builtin-tool-agent-documents';
import {
  AgentManagementManifest,
  resolveAgentManagementManifest,
} from '@orvilo/builtin-tool-agent-management';
import {
  agentSignalFeedbackIntentManifest,
  agentSignalReflectionManifest,
  agentSignalReviewManifest,
  agentSignalSkillManagementManifest,
} from '@orvilo/builtin-tool-agent-signal';
import { AuvManifest } from '@orvilo/builtin-tool-auv';
import { BriefManifest } from '@orvilo/builtin-tool-brief';
import { CalculatorManifest } from '@orvilo/builtin-tool-calculator/manifest';
import { CloudSandboxManifest } from '@orvilo/builtin-tool-cloud-sandbox';
import { CredsManifest } from '@orvilo/builtin-tool-creds';
import { GoalManifest, GoalSupervisorManifest } from '@orvilo/builtin-tool-goal';
import { GroupAgentBuilderManifest } from '@orvilo/builtin-tool-group-agent-builder';
import { GroupManagementManifest } from '@orvilo/builtin-tool-group-management';
import { ImageGenerationManifest } from '@orvilo/builtin-tool-image-generation';
import { KnowledgeBaseManifest } from '@orvilo/builtin-tool-knowledge-base';
import { LocalSystemManifest, resolveLocalSystemManifest } from '@orvilo/builtin-tool-local-system';
import { MemoryManifest } from '@orvilo/builtin-tool-memory';
import { OrviloAgentManifest, resolveOrviloAgentManifest } from '@orvilo/builtin-tool-orvilo-agent';
import { PageAgentManifest } from '@orvilo/builtin-tool-page-agent';
import { RemoteDeviceManifest } from '@orvilo/builtin-tool-remote-device';
import { selfFeedbackIntentManifest } from '@orvilo/builtin-tool-self-iteration';
import { SkillMaintainerManifest } from '@orvilo/builtin-tool-skill-maintainer';
import { resolveSkillsManifest, SkillsManifest } from '@orvilo/builtin-tool-skills';
import { TaskManifest } from '@orvilo/builtin-tool-task';
import { TopicReferenceManifest } from '@orvilo/builtin-tool-topic-reference';
import { UserInteractionManifest } from '@orvilo/builtin-tool-user-interaction';
import { VerifyToolManifest } from '@orvilo/builtin-tool-verify';
import { WebBrowsingManifest } from '@orvilo/builtin-tool-web-browsing';
import { WebOnboardingManifest } from '@orvilo/builtin-tool-web-onboarding';
import { isDesktop, RECOMMENDED_SKILLS, RecommendedSkillType } from '@orvilo/const';
import { type OrviloBuiltinTool } from '@orvilo/types';

/**
 * Default tool IDs that will always be added to the tools list.
 * Shared between frontend (createAgentToolsEngine) and server (createServerAgentToolsEngine).
 */
export const defaultToolIds = [
  OrviloActivatorManifest.identifier,
  SkillsManifest.identifier,
  WebBrowsingManifest.identifier,
  KnowledgeBaseManifest.identifier,
  MemoryManifest.identifier,
  LocalSystemManifest.identifier,
  CloudSandboxManifest.identifier,
  TopicReferenceManifest.identifier,
  AgentDocumentsManifest.identifier,
  TaskManifest.identifier,
  OrviloAgentManifest.identifier,
];

/**
 * Tool IDs that are always enabled regardless of user selection.
 * These are core system tools that the agent needs to function properly.
 *
 * `orvilo-agent` is listed first: its built-in capabilities (plan + todo management,
 * sub-agent dispatch, multimodal fallback) should be available on every agent-mode turn,
 * not gated behind explicit injection. NOTE: these rules only apply in agent mode — chat
 * mode (`enableAgentMode === false`) drops `alwaysOnToolIds` entirely. In manual
 * skill-activate mode the discovery tools in `manualModeExcludeToolIds` are still removed
 * from the defaults before the enable checker runs, so they end up disabled there.
 *
 * This list is also the source for builtin entries in the chat-input Tools popover.
 * They default to pinned but can be explicitly disabled per agent; entries represented by
 * the activation mode control itself are excluded from that menu.
 */
export const alwaysOnToolIds = [
  OrviloAgentManifest.identifier,
  OrviloActivatorManifest.identifier,
  SkillsManifest.identifier,
];

/**
 * Runtime tools represented by the skill activation mode control itself. They remain part
 * of the engine defaults but should not appear as independently configurable tool rows.
 */
export const activationModeControlledToolIds = [OrviloActivatorManifest.identifier];

/**
 * Tool IDs to exclude from defaults when in manual skill-activate mode.
 * These are the tool/skill discovery tools that should be disabled when user wants precise control.
 * Other default tools (sandbox, web browsing, etc.) remain available if enabled externally.
 */
export const manualModeExcludeToolIds = [OrviloActivatorManifest.identifier];

/**
 * Tool IDs allowed when the agent runs in chat mode
 * (`chatConfig.enableAgentMode === false`). Each one still passes through
 * its own runtime gate (e.g. knowledge base requires `hasEnabledKnowledgeBases`,
 * memory requires the global memory setting, web-browsing requires search
 * enabled, image-generation requires an explicit pin). This list is the
 * strict outer whitelist.
 *
 * In chat mode, both the server `createServerAgentToolsEngine` and the
 * frontend `createAgentToolsEngine` build their rules from ONLY these
 * identifiers, drop user plugins / `alwaysOnToolIds` entirely (except
 * image-generation, which is re-enabled only when pinned), and disable
 * `allowExplicitActivation` so the activator can't smuggle other tools in.
 */
export const chatModeAllowedToolIds = [
  KnowledgeBaseManifest.identifier,
  MemoryManifest.identifier,
  WebBrowsingManifest.identifier,
  ImageGenerationManifest.identifier,
];

/**
 * Tool IDs that make up the group supervisor's orchestration toolset:
 * dispatching members (speak / broadcast / delegate / executeAgentTask).
 *
 * These ship only with the builtin `group-supervisor` agent, but a group can
 * run a user's own agent as supervisor (`execGroupAgent` passes the configured
 * supervisor agentId, not the builtin slug). Such a run is verified as the
 * group's supervisor, and the tools engine uses this list — the single source
 * of truth — to both add these tools to the agent-mode candidate set and enable
 * them. Without it the supervisor has no way to dispatch members and degrades
 * to a single-agent monologue.
 *
 * NOTE: `orvilo-group-agent-builder` (member CRUD: searchAgent / inviteAgent /
 * createAgent) is deliberately excluded — it has no server runtime registered
 * (`apps/server/.../serverRuntimes`), so advertising it on a server-side
 * supervisor run would throw `Builtin tool "orvilo-group-agent-builder" is not
 * implemented` the moment the model called it. Add it back here once a server
 * runtime exists.
 */
export const groupSupervisorToolIds = [GroupManagementManifest.identifier];

/**
 * Tool IDs whose enabled state is decided by runtime / system conditions
 * (e.g. cloud runtime, agent has documents attached, knowledge base configured,
 * desktop gateway available), NOT by the user's plugin selection.
 *
 * The chat-input Tools popover deliberately hides these — even in manual
 * skill-activate mode — so users don't see a toggle that they can't actually
 * affect (the rules in `AgentToolsEngine.createEnableChecker` would force them
 * back on regardless of UI state).
 *
 * If you change this list, keep it in sync with the `rules` map in
 * `src/server/modules/Mecha/AgentToolsEngine/index.ts` and the matching frontend
 * `src/helpers/toolEngineering/index.ts`.
 */
export const runtimeManagedToolIds = [
  CloudSandboxManifest.identifier,
  KnowledgeBaseManifest.identifier,
  LocalSystemManifest.identifier,
  MemoryManifest.identifier,
  RemoteDeviceManifest.identifier,
  OrviloAgentManifest.identifier,
  WebBrowsingManifest.identifier,
];

/**
 * Master allowlist of builtin tool identifiers a share visitor's run may ever
 * touch, enforced at the dispatch layer (server
 * `isShareBlockedDataToolCall` / `isShareBlockedBuiltinDispatch`) — see
 * `apps/server/src/services/aiAgent/shareGate.ts`. Visitor execution is
 * retired, so the only callers left are tool calls dispatched by visitor
 * operations persisted before retirement. Also the single source of
 * truth for the agent-owner-facing share settings tool picker, which must
 * show a builtin tool as unavailable-to-visitors rather than let the owner
 * select (and the UI silently confirm) a grant the server gate can never
 * honor.
 *
 * Exported from `@orvilo/builtin-tools` — not `apps/server` — specifically
 * so the client settings UI can import the exact same Set the server gate
 * enforces, instead of hand-copying identifiers that could drift. This
 * package is already the shared boundary for cross-cutting builtin-tool
 * identifier lists consumed by both the frontend (`createAgentToolsEngine`)
 * and the server (`createServerAgentToolsEngine`) — see `defaultToolIds` /
 * `chatModeAllowedToolIds` / `runtimeManagedToolIds` above.
 *
 * DEFAULT-DENY, not default-allow-minus-a-blocklist. A share visitor's run
 * executes with the CREATOR's full credentials, and every builtin runtime
 * defaults to creator-scoped — it is written for the creator's own
 * conversation, where "the caller" and "the data owner" are the same person.
 * A share visitor breaks that assumption (caller ≠ data owner), and nothing
 * about a builtin tool's manifest or registration signals whether its
 * runtime happens to re-derive its scope from a model-suppliable argument
 * (unsafe for a visitor) or purely from server-side context like
 * `context.agentId` / `context.operationId` (safe). Under this allowlist, a
 * newly registered builtin tool — or a newly added API on an already-allowed
 * one — is exposed to a share visitor ONLY once someone explicitly adds it
 * here with file:line evidence for why its runtime cannot resolve to the
 * creator's data outside what this specific share/agent grants.
 *
 * Every entry was verified against its actual server runtime
 * (`apps/server/src/services/toolExecution/serverRuntimes/*`), not just its
 * manifest. For the rationale behind every DENIED identifier
 * (`orvilo-agent-management`, `orvilo-task`, `orvilo-creds`,
 * `orvilo-agent-builder`, `orvilo-skills`,
 * `orvilo-group-agent-builder`, `orvilo-group-management`, `agent-signal-review`,
 * `orvilo-user-interaction`, `orvilo-activator`,
 * `orvilo-local-system`, `orvilo-remote-device`,
 * `orvilo-topic-reference`, and the hidden system-only self-iteration tools),
 * see the denied-bucket doc block at the bottom of
 * `apps/server/src/services/aiAgent/shareGate.ts`.
 */
export const AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS = new Set<string>([
  CalculatorManifest.identifier,
  WebBrowsingManifest.identifier,
  ImageGenerationManifest.identifier,
  VerifyToolManifest.identifier,
  AcceptanceEvidenceManifest.identifier,
  OrviloAgentManifest.identifier,
  // `orvilo-cloud-sandbox`: allowed because a share-visitor run gets its own
  // fresh per-topic sandbox session, not the creator's. The `lh` CLI JWT
  // shim that would otherwise mint a creator-scoped token inside the shell
  // is skipped for visitor runs (see `cloudSandbox.ts` /
  // `preprocessLhCommand.ts`), and `orvilo-creds` stays denied so
  // `~/.creds/env` is never written into that session either. See the
  // positive-evidence doc block in `shareGate.ts` for the full rationale.
  CloudSandboxManifest.identifier,
  // Data-bearing tools whose whole-identifier grant AND per-API write/always-
  // blocked surface is further narrowed server-side by
  // `DATA_TOOL_ACCESS_RULES` in `shareGate.ts` — being on this allowlist only
  // lets them survive to that narrower gate, it does not itself grant read or
  // write access.
  KnowledgeBaseManifest.identifier,
  MemoryManifest.identifier,
  AgentDocumentsManifest.identifier,
]);

/**
 * Subset of {@link AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS} whose server-side
 * data grant is UNCONDITIONALLY `none` — surviving the master allowlist only
 * to be blocked outright by `DATA_TOOL_ACCESS_RULES` in
 * `apps/server/src/services/aiAgent/shareGate.ts`, for every API and no matter
 * what the share config says. There is no knowledge-base or agent-file grant
 * in `AgentShareConfig` at all, so a visitor run can never reach either
 * store.
 *
 * Memory is deliberately NOT here: its grant is conditional on
 * `allowReadMemory`, so the owner enabling that switch does change what a
 * visitor run can do.
 *
 * Exists so the owner-facing share settings tool picker can render these as
 * permanently unavailable instead of offering a toggle the server will always
 * ignore. `shareGate.test.ts` asserts this set stays exactly the set of
 * identifiers `isShareBlockedDataToolCall` blocks under maximal permissions,
 * so relaxing a grant server-side without updating this list fails there
 * rather than silently lying in the UI.
 */
export const AGENT_SHARE_NO_DATA_GRANT_BUILTIN_IDENTIFIERS = new Set<string>([
  KnowledgeBaseManifest.identifier,
  AgentDocumentsManifest.identifier,
]);

const builtinToolRegistry: OrviloBuiltinTool[] = [
  {
    discoverable: false,
    hidden: true,
    identifier: AcceptanceEvidenceManifest.identifier,
    manifest: AcceptanceEvidenceManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: VerifyToolManifest.identifier,
    manifest: VerifyToolManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: OrviloActivatorManifest.identifier,
    manifest: OrviloActivatorManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: SkillsManifest.identifier,
    manifest: SkillsManifest,
    // Context-aware: prefixes exec-class API descriptions with the run's
    // actual execution environment (cloud sandbox as fallback / offline
    // degradation), so the model never assumes they run on the user's machine.
    resolveManifest: resolveSkillsManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: SkillMaintainerManifest.identifier,
    manifest: SkillMaintainerManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: selfFeedbackIntentManifest.identifier,
    manifest: selfFeedbackIntentManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: agentSignalReviewManifest.identifier,
    manifest: agentSignalReviewManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: agentSignalReflectionManifest.identifier,
    manifest: agentSignalReflectionManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: agentSignalFeedbackIntentManifest.identifier,
    manifest: agentSignalFeedbackIntentManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: agentSignalSkillManagementManifest.identifier,
    manifest: agentSignalSkillManagementManifest,
    type: 'builtin',
  },
  {
    discoverable: isDesktop,
    hidden: true,
    identifier: AuvManifest.identifier,
    manifest: AuvManifest,
    type: 'builtin',
  },
  {
    discoverable: isDesktop,
    hidden: true,
    identifier: LocalSystemManifest.identifier,
    manifest: LocalSystemManifest,
    resolveManifest: resolveLocalSystemManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: MemoryManifest.identifier,
    manifest: MemoryManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: WebBrowsingManifest.identifier,
    manifest: WebBrowsingManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: CloudSandboxManifest.identifier,
    manifest: CloudSandboxManifest,
    type: 'builtin',
  },
  {
    identifier: AgentDocumentsManifest.identifier,
    manifest: AgentDocumentsManifest,
    type: 'builtin',
  },
  {
    identifier: CredsManifest.identifier,
    manifest: CredsManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: KnowledgeBaseManifest.identifier,
    manifest: KnowledgeBaseManifest,
    type: 'builtin',
  },
  {
    // Opt-in image generation: chat mode no longer auto-injects it, so the
    // Tools popover must expose a pin/disable control.
    identifier: ImageGenerationManifest.identifier,
    manifest: ImageGenerationManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: PageAgentManifest.identifier,
    manifest: PageAgentManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: AgentBuilderManifest.identifier,
    manifest: AgentBuilderManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: GroupAgentBuilderManifest.identifier,
    manifest: GroupAgentBuilderManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: GroupManagementManifest.identifier,
    manifest: GroupManagementManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: AgentManagementManifest.identifier,
    manifest: AgentManagementManifest,
    // Context-aware: hides the `callAgent` API inside sub-agent runs.
    resolveManifest: resolveAgentManagementManifest,
    type: 'builtin',
  },
  {
    identifier: CalculatorManifest.identifier,
    manifest: CalculatorManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: RemoteDeviceManifest.identifier,
    manifest: RemoteDeviceManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: TopicReferenceManifest.identifier,
    manifest: TopicReferenceManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: WebOnboardingManifest.identifier,
    manifest: WebOnboardingManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: UserInteractionManifest.identifier,
    manifest: UserInteractionManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: GoalSupervisorManifest.identifier,
    manifest: GoalSupervisorManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: GoalManifest.identifier,
    manifest: GoalManifest,
    type: 'builtin',
  },
  {
    identifier: TaskManifest.identifier,
    manifest: TaskManifest,
    type: 'builtin',
  },
  {
    discoverable: false,
    hidden: true,
    identifier: BriefManifest.identifier,
    manifest: BriefManifest,
    type: 'builtin',
  },
  {
    hidden: true,
    identifier: OrviloAgentManifest.identifier,
    manifest: OrviloAgentManifest,
    // Context-aware: hides the `callSubAgent` API inside group / sub-agent runs.
    resolveManifest: resolveOrviloAgentManifest,
    type: 'builtin',
  },
];

/**
 * Hoist each tool's `manifest.meta` identity (title / avatar / description / tags)
 * onto the top level, so context-free consumers (UI lists, discovery, settings,
 * token estimation) read `tool.title` / `tool.avatar` directly instead of reaching
 * into `manifest.meta`. This keeps identity stable and decoupled from `manifest`,
 * which may be produced per-turn by a context-aware `resolveManifest`.
 *
 * Optional chaining is defensive: this runs at module load, and tests routinely
 * mock individual builtin-tool packages (a stubbed manifest may lack `meta`). In
 * production every builtin manifest has a `meta`, so the hoisted fields are real.
 */
export const builtinTools: OrviloBuiltinTool[] = builtinToolRegistry.map((tool) => ({
  ...tool,
  avatar: tool.manifest?.meta?.avatar,
  description: tool.manifest?.meta?.description,
  tags: tool.manifest?.meta?.tags,
  title: tool.manifest?.meta?.title,
}));

const recommendedBuiltinIds = new Set(
  RECOMMENDED_SKILLS.filter((s) => s.type === RecommendedSkillType.Builtin).map((s) => s.id),
);

/**
 * Non-hidden builtin tools that are NOT in RECOMMENDED_SKILLS.
 * These tools default to uninstalled and must be explicitly installed by the user from the Skill Store.
 */
export const defaultUninstalledBuiltinTools = builtinTools
  .filter((t) => !t.hidden && !recommendedBuiltinIds.has(t.identifier))
  .map((t) => t.identifier);

const builtinIdentifierSet = new Set(builtinTools.map((tool) => tool.identifier));

/**
 * Whether `identifier` belongs to the population
 * {@link AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS} governs — the real builtin
 * tool registry above, the same source the server gate
 * (`hasServerRuntime`/`BuiltinToolsExecutor`) resolves against. MCP servers,
 * market plugins, and custom plugins never appear in this registry, so they
 * fall outside this allowlist's jurisdiction entirely.
 */
export const isBuiltinToolIdentifier = (identifier: string): boolean =>
  builtinIdentifierSet.has(identifier);

/**
 * Whether `identifier` would survive the agent-share builtin-tool gate: true
 * for anything outside this allowlist's jurisdiction (MCP/market/custom
 * plugins — left entirely to the owner's `enabledToolIds` picker), and for a
 * governed builtin identifier, true only when it is explicitly listed in
 * {@link AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS}.
 *
 * Shared by the server gate (`shareGate.ts`) and the owner-facing tool picker
 * so both sides agree on exactly which builtin tools a share visitor's run
 * can ever reach.
 */
export const isAgentShareAllowedBuiltinIdentifier = (identifier: string): boolean =>
  !isBuiltinToolIdentifier(identifier) || AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS.has(identifier);
