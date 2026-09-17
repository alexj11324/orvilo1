import {
  AgentDocumentsApiName,
  AgentDocumentsIdentifier,
} from '@orvilo/builtin-tool-agent-documents';
import { KnowledgeBaseApiName, KnowledgeBaseIdentifier } from '@orvilo/builtin-tool-knowledge-base';
import {
  OrviloAgentApiName,
  OrviloAgentIdentifier,
} from '@orvilo/builtin-tool-orvilo-agent';
import { MEMORY_WRITE_API_NAMES, MemoryIdentifier } from '@orvilo/builtin-tool-memory';
import {
  AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS,
  builtinTools,
  isBuiltinToolIdentifier,
} from '@orvilo/builtin-tools';
import { isShareToolApiGranted, resolveShareToolGrants } from '@orvilo/const';
import type { AgentShareToolGrant } from '@orvilo/types';

/**
 * Dispatch-time tool gate for shared-agent visitor runs — RETIRED STARTUP.
 *
 * Visitor execution can no longer start (`shareChat.execAgent` refuses
 * unconditionally), so the operation-build-time half of this module — the
 * `AgentShareGate` plumbing, the assembled-tool-set strips, and the
 * plugin/skill allowlist intersections — is gone with it.
 *
 * What remains is the unbypassable dispatch-time enforcement for the runs
 * that ALREADY exist: an operation created before retirement persists its
 * `agentShareVisitor` marker onto `state.principal.actor.shareVisitor`, and
 * every later step re-presents that marker to `BuiltinToolsExecutor.execute`
 * as `context.agentShareVisitor`. As long as one of those runs is still
 * streaming, settling, or being resumed to finish, its tool calls must keep
 * clearing the same gates they were authorized under — which is exactly what
 * {@link isShareBlockedBuiltinDispatch} (and the data-tool rules it delegates
 * to) enforces, re-reading the UNSTRIPPED manifests persisted on the op.
 */

/**
 * Minimal shape a `DataToolAccessRule.grant` needs — either the full share
 * gate's `shareConfig`, or the trimmed `agentShare` marker threaded through
 * `RuntimeExecutorContext` / `ToolExecutionContext` for tool calls resolved
 * outside this module (see {@link isShareBlockedDataToolCall}).
 */
export interface ShareDataToolPermissions {
  allowReadMemory?: boolean;
  /**
   * Agent's own persisted, `enabled` knowledge-base ids (never
   * visitor-supplied). Always empty for a share run — a share visitor never
   * saw the creator's files/knowledge bases — but kept so the id-scoping rule
   * below stays wired should a knowledge-base grant ever return.
   */
  knowledgeBaseIds?: string[];
}

/**
 * See `AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS`'s JSDoc in
 * `@orvilo/builtin-tools` for the full per-identifier evidence. Aliased here
 * so the two enforcement points below read as one local rule.
 */
const SHARE_VISITOR_ALLOWED_IDENTIFIERS = AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS;

/**
 * Whether `identifier` belongs to the population this allowlist governs — the
 * real builtin tool registry (`@orvilo/builtin-tools`), the same source
 * `BuiltinToolsExecutor`/`hasServerRuntime` resolve against. MCP servers,
 * market plugins, and custom plugins never appear in this registry, so they
 * fall outside this allowlist's jurisdiction entirely.
 */
const isGovernedByBuiltinAllowlist = isBuiltinToolIdentifier;

type DataToolGrant = 'none' | 'read';

/**
 * Read/write surface of a builtin tool whose APIs act directly on the
 * creator's private data store (memory, knowledge bases, agent documents).
 *
 * These tools are gated by three independent axes: whether the share grants
 * ANY access at all (`grant`) — share grants are `none` | `read` only, there
 * is no write grant to honor; whether a given API is a write regardless of
 * grant (`writeApiNames`); and whether a "read" API can even be scoped to what
 * the share actually grants at all (`alwaysBlockedApiNames`,
 * `isArgsOutOfScope`) — some reads act on the caller's ENTIRE personal data
 * store with no id parameter tying them to the agent's own assignment, so a
 * `read` grant must not enable them.
 */
interface DataToolAccessRule {
  /**
   * API names that read across the creator's whole personal store
   * (independent of what this specific agent is assigned) with no id argument
   * that could scope the call. Always blocked for a share visitor, even when
   * `grant` is `read` — unlike `writeApiNames`, these ARE reads, but a read
   * grant only ever means "read what this agent is assigned," never "read
   * everything the creator owns."
   */
  alwaysBlockedApiNames?: string[];
  /** Resolve this share's grant for the tool from its permission fields. */
  grant: (permissions: ShareDataToolPermissions) => DataToolGrant;
  /**
   * For an API that DOES take an id scoping it to a specific resource (e.g.
   * `viewKnowledgeBase`'s `id`): whether the id(s) `args` references fall
   * outside what this share's permissions actually allow. Must fail closed —
   * an id that cannot be verified (missing, wrong type, or the allowlist
   * itself is empty/absent) is out of scope.
   */
  isArgsOutOfScope?: (permissions: ShareDataToolPermissions, apiName: string, args: any) => boolean;
  /** API names that mutate creator data; stripped/blocked unconditionally. */
  writeApiNames: string[];
}

/**
 * Registry of data-bearing builtin tools a share visitor could be whitelisted
 * into (`shareConfig.toolGrants`) without the whitelist itself implying
 * read OR write access to the underlying store.
 *
 * Adding a new write API to one of these packages must add it here too —
 * `shareGate.test.ts` asserts against the REAL exported manifests, so a rename
 * or omission fails that test instead of silently reopening the hole.
 */
const DATA_TOOL_ACCESS_RULES: Record<string, DataToolAccessRule> = {
  [AgentDocumentsIdentifier]: {
    // No file grant exists in `AgentShareConfig` — fail closed rather than
    // silently defaulting the missing grant to `read`.
    grant: () => 'none',
    writeApiNames: [
      AgentDocumentsApiName.createDocument,
      AgentDocumentsApiName.copyDocument,
      AgentDocumentsApiName.modifyNodes,
      AgentDocumentsApiName.removeDocument,
      AgentDocumentsApiName.renameDocument,
      AgentDocumentsApiName.replaceDocumentContent,
      AgentDocumentsApiName.updateLoadRule,
    ],
  },
  [KnowledgeBaseIdentifier]: {
    // `listFiles` / `getFileDetail` browse the creator's whole resource
    // library (files not yet in any knowledge base) — that library has no
    // per-agent assignment concept at all, so no grant can scope it to "what
    // this agent is assigned." `listKnowledgeBases` lists every knowledge base
    // the creator owns, not just the ones mounted on this agent, and takes no
    // id to scope it either. `readKnowledge` accepts arbitrary
    // `file_*`/`docs_*` ids read straight from the creator's file/document
    // store with no knowledge-base-membership check of its own. Blocking them
    // is the fail-closed choice: `searchKnowledgeBase` (already agent/task-id
    // scoped server-side) still returns real chunk/document text, so a `read`
    // grant would remain useful without this hole.
    alwaysBlockedApiNames: [
      KnowledgeBaseApiName.listFiles,
      KnowledgeBaseApiName.getFileDetail,
      KnowledgeBaseApiName.listKnowledgeBases,
      KnowledgeBaseApiName.readKnowledge,
    ],
    // No knowledge-base grant exists in `AgentShareConfig`.
    grant: () => 'none',
    // `viewKnowledgeBase` DOES take an `id`, and the agent's own assignment
    // would be known (`ShareDataToolPermissions.knowledgeBaseIds`) — kept
    // wired so restoring a knowledge-base grant only needs the `grant` line
    // above changed, not this scoping rule re-derived.
    isArgsOutOfScope: (permissions, apiName, args) => {
      if (apiName !== KnowledgeBaseApiName.viewKnowledgeBase) return false;
      const id = args?.id;
      if (typeof id !== 'string' || !id) return true;
      const allowed = permissions.knowledgeBaseIds;
      return !allowed || !allowed.includes(id);
    },
    writeApiNames: [
      KnowledgeBaseApiName.createKnowledgeBase,
      KnowledgeBaseApiName.deleteKnowledgeBase,
      KnowledgeBaseApiName.createDocument,
      KnowledgeBaseApiName.addFiles,
      KnowledgeBaseApiName.removeFiles,
    ],
  },
  [MemoryIdentifier]: {
    grant: (permissions) => (permissions.allowReadMemory ? 'read' : 'none'),
    // Shared with the share settings picker so the owner is never offered a
    // write API the gate strips anyway.
    writeApiNames: [...MEMORY_WRITE_API_NAMES],
  },
};

/**
 * Whether a specific `identifier`/`apiName` tool call must be blocked for a
 * share visitor run. This is the enforcement reusable from the actual dispatch
 * chokepoint (`BuiltinToolsExecutor.execute`, which invokes
 * `runtime[apiName](...)` directly and never re-consults the possibly
 * already-trimmed manifest — the trimmed manifest only changes what the model
 * is OFFERED via function-calling schema, not what the executor is willing to
 * run if the model calls it anyway).
 *
 * DEFAULT-DENY for the builtin population: an `identifier` that resolves
 * against the real `@orvilo/builtin-tools` registry
 * (`isGovernedByBuiltinAllowlist`) but is NOT in
 * `SHARE_VISITOR_ALLOWED_IDENTIFIERS` is blocked outright, with no
 * `apiName`-level distinction. A non-builtin identifier (MCP server, market
 * plugin, custom plugin) is NOT this function's concern at all — it falls
 * through to `false` untouched.
 *
 * `args` is the tool call's parsed arguments, needed only for
 * `isArgsOutOfScope` rules. Omit it for call sites that only need the
 * identifier/apiName-level check (grant / write / always-blocked).
 */
export const isShareBlockedDataToolCall = (
  permissions: ShareDataToolPermissions,
  identifier: string,
  apiName: string,
  args?: any,
): boolean => {
  // Outside this gate's jurisdiction entirely — MCP/market/custom plugin
  // identifiers are governed by the toolGrants picker, not this allowlist.
  if (!isGovernedByBuiltinAllowlist(identifier)) return false;

  // Default-deny: a known builtin identifier not on the allowlist is blocked
  // unconditionally, including any tool registered after this allowlist was
  // written — the whole point of inverting a denylist.
  if (!SHARE_VISITOR_ALLOWED_IDENTIFIERS.has(identifier)) return true;

  const rule = DATA_TOOL_ACCESS_RULES[identifier];
  if (!rule) return false;

  const grant = rule.grant(permissions);
  if (grant === 'none') return true;

  if (rule.writeApiNames.includes(apiName)) return true;
  if (rule.alwaysBlockedApiNames?.includes(apiName)) return true;
  if (args !== undefined && rule.isArgsOutOfScope?.(permissions, apiName, args)) return true;

  return false;
};

/**
 * Whether an API's own `humanIntervention` policy can ever HONESTLY complete
 * for a share-visitor run. Every share run was forced onto `approvalMode:
 * 'headless'` — the only mode with **no approver waited for**: an
 * `'always'`-policy call becomes an immediate blocked tool result
 * (`resolve_blocked_tools`), and a `'required'`-policy call would silently
 * auto-run, granting itself the consent nobody was present to give. Blocking
 * both classes at dispatch is the fail-closed reading: never run a function
 * that either cannot run or would run without its declared consent step. A
 * `dynamic` config might resolve to `'never'` for some argument, but this
 * static check cannot prove it always will.
 *
 * `undefined` (no config at all) and the literal string `'never'` are the only
 * two configs that execute with no intervention semantics attached.
 */
const isApiUsableForShareVisitor = (humanIntervention: unknown): boolean =>
  humanIntervention === undefined || humanIntervention === 'never';

/**
 * Sub-agent dispatch is not available in shared visitor runs: the server
 * sub-agent runner spawns the child via a plain `execAgent` call that does
 * NOT re-derive the parent's share restrictions — the child would run with
 * the creator's full, unrestricted tool surface. Blocked unconditionally at
 * dispatch for any in-flight visitor op.
 *
 * `lobe-agent-management`'s dispatch API (`callAgent`) does NOT need an entry
 * here: the whole tool — dispatch included — is simply absent from
 * `SHARE_VISITOR_ALLOWED_IDENTIFIERS`, so it never survives that gate.
 */
const SUB_AGENT_DISPATCH_APIS: Record<string, string> = {
  // Both identifiers are blocked: ops persisted before the lobe→orvilo rename
  // carry the legacy `lobe-agent` identifier, anything newer carries
  // `orvilo-agent` — a visitor run must not reach `callSubAgent` under either.
  'lobe-agent': OrviloAgentApiName.callSubAgent,
  [OrviloAgentIdentifier]: OrviloAgentApiName.callSubAgent,
};

/**
 * FULL dispatch-time gate for a share-visitor builtin tool call — the check
 * `BuiltinToolsExecutor.execute` runs on every call that reaches it. Strictly
 * wider than {@link isShareBlockedDataToolCall}: a call that bypassed
 * assembly (resume path, recovery hint, model-fabricated call to a tool it
 * was never offered) must clear ALL the same gates the assembled tool set
 * enforced, not only the data-tool rules:
 *
 * 1. master default-deny allowlist (`SHARE_VISITOR_ALLOWED_IDENTIFIERS`);
 * 2. the owner's own `toolGrants` picker — being on the master allowlist
 *    is necessary but NOT sufficient; a tool the creator never enabled for
 *    this share (e.g. image generation spending the creator's quota) must not
 *    run just because a call reached the executor;
 * 3. `humanIntervention` policy, re-derived from the REAL manifest: the
 *    assembly strip removed intervention-gated APIs from the manifest the
 *    runtime later consults, so at dispatch time such a call looks
 *    config-less and `headless` would silently auto-run it — the manifest in
 *    `@orvilo/builtin-tools` is the unstripped source of truth, so the
 *    consent-gated call is blocked here instead;
 * 4. the per-API data-tool rules ({@link isShareBlockedDataToolCall}).
 *
 * Non-builtin identifiers (MCP/market/custom plugins, LobeHub skills) pass
 * through untouched: their id namespace does not reliably match
 * `toolGrants` identifiers.
 */
export const isShareBlockedBuiltinDispatch = (
  agentShare: ShareDataToolPermissions & { toolGrants?: AgentShareToolGrant[] },
  identifier: string,
  apiName: string,
  args?: any,
): boolean => {
  if (!isGovernedByBuiltinAllowlist(identifier)) return false;

  if (!SHARE_VISITOR_ALLOWED_IDENTIFIERS.has(identifier)) return true;
  // The owner's picker must grant this identifier at all (toolset-level or
  // naming this specific `apiName`) — a grant scoped to a DIFFERENT api on
  // the same identifier does not authorize this call.
  if (!isShareToolApiGranted(resolveShareToolGrants(agentShare.toolGrants), identifier, apiName))
    return true;

  // Sub-agent dispatch has no humanIntervention config to catch it, and the
  // server sub-agent runner spawns the child via a plain `execAgent` call
  // that does NOT re-derive the parent's share restrictions — the child would
  // run with the creator's full, unrestricted tool surface.
  if (SUB_AGENT_DISPATCH_APIS[identifier] === apiName) return true;

  const manifest = builtinTools.find((tool) => tool.identifier === identifier)?.manifest;
  const toolLevelHumanIntervention = (manifest as { humanIntervention?: unknown } | undefined)
    ?.humanIntervention;
  // A tool-level 'required'/'always'/dynamic config blocks every API here too —
  // an api-level 'never' must not override it at dispatch when it could not
  // have survived assembly either.
  if (!isApiUsableForShareVisitor(toolLevelHumanIntervention)) return true;
  const apiHumanIntervention = manifest?.api?.find(
    (api) => api.name === apiName,
  )?.humanIntervention;
  if (!isApiUsableForShareVisitor(apiHumanIntervention ?? toolLevelHumanIntervention)) return true;

  return isShareBlockedDataToolCall(agentShare, identifier, apiName, args);
};

/**
 * Rationale for every registered builtin identifier that is DENIED — i.e.
 * absent from `AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS`. Under a denylist an
 * identifier had to be explicitly proven dangerous to be blocked; under the
 * allowlist an identifier has to be explicitly proven safe to be exposed, so
 * this block exists purely to record the evidence trail for reviewers — the
 * denial itself needs no code beyond "not in the Set". The evidence stays
 * relevant while any pre-retirement visitor op can still reach the dispatch
 * gate above.
 *
 * Confirmed leak paths (a concrete visitor→creator-data route was found):
 *
 * - `lobe-agent-management`: `agentManagementRuntime` is scoped by `userId`
 *   (the creator — the run executes as the creator), but `agentId` is a
 *   free-form model argument on nearly every API. `searchAgent` enumerates the
 *   creator's whole workspace; `getAgentDetail` returns any creator-owned
 *   agent's full config (system prompt included) for an arbitrary id;
 *   `createAgent` / `updateAgent` / `updatePrompt` / `duplicateAgent` /
 *   `installPlugin` persistently mutate the creator's agent collection.
 *
 * - `agent-signal-review`: `listManagedSkills` / `getManagedSkill` prefer an
 *   optional model-supplied `agentId` over the context-bound one, letting a
 *   visitor read ANY other agent's private managed-skill catalog under the
 *   same creator. `writeMemory` / `createSkillIfAbsent` /
 *   `replaceSkillContentCAS` are unconditional creator-scoped mutations, and
 *   share grants are `none`/`read` only.
 *
 * - `lobe-skill-maintainer` / `agent-signal-skill-management`: hidden,
 *   system-only tools whose every API WRITES agent-document rows under the
 *   creator's account. No write grant exists to honor.
 *
 * - `lobe-task` / `lobe-goal`: `TaskModel`/`taskRouter` are scoped only by
 *   `userId`/`workspaceId` — the CREATOR's. Every mutating and single-task-read
 *   API takes a model-supplied identifier resolved with no topic/conversation
 *   check, letting a visitor read, edit, delete, reschedule or RUN (spending
 *   the creator's budget) any task in the workspace. `listTasks`'s `scope:
 *   'allAgents'` makes the breadth explicit.
 *
 * - `lobe-creds`: `injectCreds` takes a free-form `keys: string[]` and decrypts
 *   matching entries out of the creator's ENTIRE saved credential store.
 *
 * - `lobe-message`: every bot-management API resolves `botId` straight from
 *   model args with no check against `context.agentId`; the messenger APIs act
 *   on the creator's whole personal messenger account.
 *
 * - `lobe-skill-store`: the `importFrom*` family fetches attacker-chosen
 *   remote code/zip content and persists it into the creator's skill catalog.
 *
 * - `lobe-agent-builder`: `updateConfig`/`updatePrompt` overwrite the shared
 *   agent's own `systemRole`/config wholesale — a visitor rewriting the
 *   creator's live agent. `installPlugin` installs an arbitrary market MCP
 *   plugin onto it as the creator, with no consent step.
 *
 * - `lobe-skills`: `findById`/`findByName` resolve any skill across the
 *   creator's ENTIRE personal skill catalog, scoped only by an opt-out
 *   `disabledSkillIds` set.
 *
 * - `lobe-brief`: `createBrief` unconditionally persists a row via
 *   `BriefModel.create` under `context.userId` (the creator) from
 *   model-supplied content, with no intervention marker to gate it.
 *
 * - `lobe-group-agent-builder` / `lobe-group-management`: group-orchestration
 *   tools operating on the creator's group-agent collection and membership,
 *   with no share-run scoping designed in — same risk class as
 *   `lobe-agent-management`.
 *
 * - `lobe-topic-reference`: `topicReferenceRuntime.getTopicContext`
 *   (`apps/server/src/services/toolExecution/serverRuntimes/topicReference.ts`)
 *   resolves a free-form model-supplied `topicId` via
 *   `TopicModel.findOwnTopicById`, scoped only to the creator's `userId` — not
 *   to this share or agent — letting a visitor's model read the summary or
 *   recent messages of ANY other topic the creator owns by guessing/enumerating
 *   ids. `DATA_TOOL_ACCESS_RULES` has no entry for it (it isn't a
 *   memory/knowledge-base/agent-documents style store), so nothing narrows the
 *   allowlist grant. The automatic `<refer_topic>` injection path
 *   (`serverCallLlmContextBuilder.ts`) is separately share-scoped via
 *   `isTopicVisibleToRun` and is unaffected by this denial — only the
 *   model-invokable tool-call path is unsafe.
 *
 * Denied for lack of positive safety evidence (no confirmed exploit was
 * required to withhold access — the point of default-deny is that an unproven
 * tool does not ship):
 *
 * - `lobe-local-system` / `lobe-browser` / `lobe-remote-device`: these proxy
 *   through `deviceGateway` to the creator's own registered physical
 *   device(s). A visitor executing arbitrary commands or driving a live
 *   browser session on the CREATOR's own machine is a far larger blast radius
 *   than any single data store.
 *
 * - `lobe-web-onboarding`: reads and WRITES the creator's own onboarding
 *   `SOUL.md` document and persona.
 *
 * - `lobe-self-feedback-intent` / `agent-signal-reflection` /
 *   `agent-signal-feedback-intent`: hidden, system-only self-iteration tools
 *   whose write paths were never audited for share safety.
 *
 * - `lobe-page-agent`: not unsafe — genuinely unreachable for a share
 *   visitor's run (`execAgent` strips it whenever `appContext?.scope !==
 *   'page'`, and the share visitor path never sets `scope`), so allowlisting
 *   it would only let the owner-facing tool picker confirm a grant no visitor
 *   conversation can ever exercise.
 *
 * - `lobe-user-interaction` / `lobe-activator`: same "picker promises an
 *   unusable grant" class, not a data leak. Every share run was forced onto
 *   `approvalMode: 'headless'` with no approver ever present:
 *   `lobe-user-interaction`'s only entry point (`askUserQuestion`,
 *   `humanIntervention: 'always'`) is converted to a blocked tool result and
 *   never runs, and its other APIs all require a `requestId` only a
 *   successful `askUserQuestion` mints. `lobe-activator`'s only API
 *   (`activateTools`, `humanIntervention: 'required'`) would auto-run under
 *   headless but was stripped from the offer instead; at dispatch time the
 *   `humanIntervention` check above blocks it for any persisted op.
 */

/**
 * Positive evidence for builtin identifiers that WERE added to
 * `AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS` despite reaching outside a single
 * data store — recorded here, rather than left implicit, because their
 * general-purpose reach needs an explicit safety argument instead of just the
 * absence of a known exploit.
 *
 * - `lobe-cloud-sandbox`: general-purpose shell/script execution, but a share
 *   visitor's run gets a fresh, isolated per-topic sandbox session — never
 *   the creator's own sandbox state. The `lh` CLI's JWT credential shim
 *   (`preprocessLhCommand.ts`) that would otherwise mint a creator-scoped
 *   token inside a shell the visitor controls is skipped entirely for
 *   `agentShareVisitor` runs (`serverRuntimes/cloudSandbox.ts`), and
 *   `lobe-creds` stays denied above so nothing ever writes `~/.creds/env`
 *   into that session either. No creator credential or JWT is therefore
 *   reachable from inside a visitor's sandbox command.
 */
