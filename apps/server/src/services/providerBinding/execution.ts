import type { ProviderBinding } from '@orvilo/agent-execution/controlPlane';
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import type { OrviloEngineKind, ProviderBindingConfig } from '@orvilo/types';
import { resolveOrviloEngine } from '@orvilo/types';

import { ProviderBindingModel } from '@/database/models/providerBinding';
import type { OrviloDatabase } from '@/database/type';

import { resolveProviderCredentialHeaders } from './controlPlane';

export type ProviderBindingRow = NonNullable<Awaited<ReturnType<ProviderBindingModel['find']>>>;

/**
 * Binding rows whose selection admits a run on the Orvilo runtime. Resolution
 * is a read only — it never issues credentials; `issueBindingExecution` is the
 * fence. `list` orders by `updatedAt` descending, so the most recently saved
 * matching binding wins.
 *
 * `match` narrows the candidates to the task's requested provider/model — a
 * run configured for provider X may only resolve binding X; absent fields are
 * unconstrained. No match means `undefined`, and callers fail loudly rather
 * than falling back to a different binding or an environment key.
 */
export interface ProviderBindingMatch {
  model?: string;
  provider?: string;
}

/**
 * Spawn-side dispatch target used by execAgent's BYOK gate
 * (feat/byok-execution-chain). Distinct from the canonical
 * `selection.target` literal: `device` admits `local` bindings (any of the
 * user's devices) and `device` bindings pinned to `deviceId`; `sandbox`
 * admits sandbox-targeted bindings only.
 */
export interface OrviloBindingTarget {
  deviceId?: string;
  kind: 'device' | 'sandbox';
}

/**
 * Issued BYOK execution for a spawned Orvilo runtime, as execAgent consumes
 * it: a descriptor (`bindingId`/`revision`/`provider`/`model`/`endpoint`)
 * plus the engine-specific spawn material.
 *
 * `env`/`execArgs` are materialized ONLY for `device` dispatch — the
 * authenticated device-dispatch channel carries server-minted spawn env into
 * the user's own process, the one arm where that surface legitimately lives.
 * For `sandbox` dispatch they stay empty: a spawned CLI in a cloud sandbox
 * receives provider credentials through the embedded inference broker
 * (host-side resolution via `secretReference`), never through process env.
 */
export interface IssuedByokSpawnExecution {
  bindingId: string;
  endpoint: string;
  /** Spawn env minted for the engine's CLI family; empty unless `device`. */
  env: Record<string, string>;
  /**
   * Extra `lh hetero exec` wrapper args (`--agent-arg=<native arg>` encoded so
   * wrapper flags like `-c` cannot collide with native ones); empty unless
   * `device`.
   */
  execArgs: string[];
  model: string;
  provider: string;
  revision: number;
}

/**
 * execAgent-facing resolution shape (#367): `unavailable` distinguishes "a
 * binding matched but could not issue credentials" from "no binding applies"
 * — callers must fail the run loudly rather than fall back to another
 * provider account.
 */
export type OrviloBindingResolution =
  | { status: 'none' }
  /** A candidate matched but failed the mint-time fence (stale/disabled/gone). */
  | { status: 'unavailable' }
  | { status: 'applied'; execution: IssuedByokSpawnExecution };

// The compat overload sits above the canonical signature: `target` as an
// `OrviloBindingTarget` object selects the spawn-material resolution while a
// `selection.target` string keeps the canonical row lookup.
export function resolveOrviloProviderBinding(
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind | string | null | undefined,
  target: OrviloBindingTarget,
): Promise<OrviloBindingResolution>;
export function resolveOrviloProviderBinding(
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind | string | null | undefined,
  target: ProviderBindingConfig['selection']['target'],
  match?: ProviderBindingMatch,
): Promise<ProviderBindingRow | undefined>;
export async function resolveOrviloProviderBinding(
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind | string | null | undefined,
  target: ProviderBindingConfig['selection']['target'] | OrviloBindingTarget,
  match?: ProviderBindingMatch,
) {
  const wanted = resolveOrviloEngine(engine);
  if (typeof target === 'object') {
    const candidate = await selectOrviloProviderBinding(db, userId, wanted, target);
    if (!candidate) return { status: 'none' };
    const execution = await issueBindingExecution(
      db,
      userId,
      { id: candidate.id, revision: candidate.revision },
      wanted,
      target,
    );
    if (!execution) return { status: 'unavailable' };
    return { execution, status: 'applied' };
  }
  const rows = await new ProviderBindingModel(db, userId).list();
  return rows.find((row) => {
    const selection = row.config?.selection;
    if (!selection || selection.runtime !== 'orvilo' || selection.target !== target) return false;
    if (resolveOrviloEngine(selection.engine) !== wanted) return false;
    if (match?.provider && row.config?.provider !== match.provider) return false;
    if (match?.model && row.config?.model !== match.model) return false;
    return true;
  });
}

/**
 * The canonical row-resolution call shape — what broker seams such as
 * `EmbeddedInferenceBridgeDeps.resolveBinding` substitute. `typeof`
 * `resolveOrviloProviderBinding` now covers the whole overload set, so seams
 * name this alias to keep the canonical contract.
 */
export type ResolveOrviloProviderBindingForTarget = (
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind | string | null | undefined,
  target: ProviderBindingConfig['selection']['target'],
  match?: ProviderBindingMatch,
) => Promise<ProviderBindingRow | undefined>;

/**
 * The run-grant scope a binding may be issued in. `ownerId` is the
 * server-derived delegation subject (never agent payload); `tenantId` is the
 * canonical run tenant (workspace id) stamped onto the contract binding.
 */
export interface BindingExecutionClaim {
  bindingId: string;
  bindingRevision: number;
  ownerId: string;
  tenantId: string;
}

export interface IssuedByokExecution {
  binding: ProviderBinding;
}

// The claim form (canonical) stays the last signature; seams that substitute
// the broker path name `IssueBindingExecutionForClaim` instead of `typeof`.
export function issueBindingExecution(
  db: OrviloDatabase,
  userId: string,
  candidate: { id: string; revision: number },
  engine: OrviloEngineKind | string | null | undefined,
  target: OrviloBindingTarget,
): Promise<IssuedByokSpawnExecution | undefined>;
/**
 * Revision-fenced issuance: re-load the binding inside the caller's
 * transaction, refuse a row that moved, and prove the referenced credential is
 * still a personal credential owned by the claiming user. Decryption never
 * happens here — the issued binding carries only the vault `secretReference`,
 * which `SqlTrustedProviderBackend` resolves host-side at request time.
 * `undefined` means unavailable; callers fail loudly, never fall back to
 * environment keys.
 */
export function issueBindingExecution(
  db: OrviloDatabase,
  claim: BindingExecutionClaim,
): Promise<IssuedByokExecution | undefined>;
export async function issueBindingExecution(
  db: OrviloDatabase,
  claimOrUserId: BindingExecutionClaim | string,
  candidate?: { id: string; revision: number },
  engine?: OrviloEngineKind | string | null,
  target?: OrviloBindingTarget,
) {
  if (typeof claimOrUserId === 'string') {
    if (!candidate || !target) return undefined;
    return issueByokSpawnExecution(db, claimOrUserId, candidate, engine, target);
  }
  const claim = claimOrUserId;
  const model = new ProviderBindingModel(db, claim.ownerId);
  const row = await model.find(claim.bindingId);
  if (!row || row.revision !== claim.bindingRevision) return undefined;
  const config = row.config;
  if (!config || !(await model.ownsCredentialReference(config.secretReference))) return undefined;
  return {
    binding: {
      bindingId: row.id,
      modelRoutes: [config.model],
      ownerId: row.userId,
      providerId: config.provider,
      revision: row.revision,
      schemaVersion: CONTROL_PLANE_VERSION,
      secretReference: config.secretReference,
      tenantId: claim.tenantId,
    },
  };
}

/** The canonical claim-fence call shape — see `ResolveOrviloProviderBindingForTarget`. */
export type IssueBindingExecutionForClaim = (
  db: OrviloDatabase,
  claim: BindingExecutionClaim,
) => Promise<IssuedByokExecution | undefined>;

/** Codex provider id minted for the binding; config travels via `-c` args. */
const CODEX_BYOK_PROVIDER_ID = 'orvilo_byok';
/** Env var holding the API key codex reads via `env_key`. */
const CODEX_BYOK_KEY_ENV = 'ORVILO_BYOK_API_KEY';
/** Prefix for per-header env vars referenced by codex `env_http_headers`. */
const CODEX_BYOK_HEADER_ENV_PREFIX = 'ORVILO_BYOK_H_';

/**
 * Anthropic SDK clients append `/v1/messages` to their base URL while bindings
 * store the OpenAI-compatible root — strip the suffixes the SDK would append.
 */
const normalizeAnthropicBaseUrl = (endpoint: string): string => {
  let normalized = endpoint;
  for (const suffix of ['/v1/messages', '/v1']) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  return normalized;
};

const tomlString = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** Env var name for a forwarded header — deterministic, filename-safe. */
const headerEnvVarName = (index: number) => `${CODEX_BYOK_HEADER_ENV_PREFIX}${index}`;

interface BuiltByokCredentials {
  env: Record<string, string>;
  execArgs: string[];
}

const buildClaudeSdkCredentials = (input: {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
}): BuiltByokCredentials => {
  const env: Record<string, string> = {
    // Claude Code reads auth + routing from env; the host-managed contract
    // tells it to skip its own login flows and use the issued material.
    ANTHROPIC_BASE_URL: normalizeAnthropicBaseUrl(input.endpoint),
    ANTHROPIC_MODEL: input.model,
    ANTHROPIC_SMALL_FAST_MODEL: input.model,
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    CLAUDE_CODE_USE_BEDROCK: '0',
    CLAUDE_CODE_USE_MANTLE: '0',
    CLAUDE_CODE_USE_VERTEX: '0',
  };
  const customHeaders: string[] = [];
  for (const [name, value] of Object.entries(input.headers)) {
    customHeaders.push(`${name}: ${value}`);
    const lower = name.toLowerCase();
    if (lower === 'authorization') {
      const token = value.replace(/^bearer\s+/i, '').trim();
      if (token && token !== value) env.ANTHROPIC_AUTH_TOKEN = token;
    } else if (lower === 'x-api-key') {
      env.ANTHROPIC_API_KEY = value;
    }
  }
  if (customHeaders.length > 0) env.ANTHROPIC_CUSTOM_HEADERS = customHeaders.join('\n');
  return { env, execArgs: [] };
};

const buildCodexCredentials = (input: {
  endpoint: string;
  headers: Record<string, string>;
}): BuiltByokCredentials => {
  const env: Record<string, string> = {};
  const config: Record<string, string> = {
    base_url: tomlString(input.endpoint),
    wire_api: tomlString('chat'),
  };
  const entries = Object.entries(input.headers);
  // The auth secret feeds `env_key` (codex sends `Authorization: Bearer <value>`);
  // every other stored header forwards verbatim via `env_http_headers` so the
  // wire shape matches the broker's request material exactly.
  const forwardedHeaders: Record<string, string> = {};
  let bearerToken: string | undefined;
  entries.forEach(([name, value], index) => {
    if (name.toLowerCase() === 'authorization' && /^bearer\s+/i.test(value)) {
      bearerToken = value.replace(/^bearer\s+/i, '').trim();
      return;
    }
    forwardedHeaders[name] = headerEnvVarName(index);
    env[headerEnvVarName(index)] = value;
  });
  if (bearerToken !== undefined) {
    env[CODEX_BYOK_KEY_ENV] = bearerToken;
    config.env_key = tomlString(CODEX_BYOK_KEY_ENV);
  }
  // An inline TOML table — the `-c` value must be a table, not a string, so it
  // is emitted raw (header names map to env var NAMES; values stay in env).
  const envHttpHeaders =
    Object.keys(forwardedHeaders).length > 0
      ? `{${Object.entries(forwardedHeaders)
          .map(([name, envName]) => `${tomlString(name)}=${tomlString(envName)}`)
          .join(',')}}`
      : undefined;
  const execArgs = [
    '--agent-arg=-c',
    `--agent-arg=model_provider=${tomlString(CODEX_BYOK_PROVIDER_ID)}`,
    ...Object.entries(config).flatMap(([key, value]) => [
      '--agent-arg=-c',
      `--agent-arg=model_providers.${CODEX_BYOK_PROVIDER_ID}.${key}=${value}`,
    ]),
    ...(envHttpHeaders
      ? [
          '--agent-arg=-c',
          `--agent-arg=model_providers.${CODEX_BYOK_PROVIDER_ID}.env_http_headers=${envHttpHeaders}`,
        ]
      : []),
  ];
  return { env, execArgs };
};

/** Map the decrypted request headers onto the engine CLI family's contract. */
export const buildByokExecutionCredentials = (input: {
  endpoint: string;
  engine: OrviloEngineKind;
  headers: Record<string, string>;
  model: string;
}): BuiltByokCredentials =>
  input.engine === 'codex-app-server'
    ? buildCodexCredentials(input)
    : buildClaudeSdkCredentials(input);

const selectionMatches = (
  config: ProviderBindingConfig['selection'],
  engine: OrviloEngineKind,
  target: OrviloBindingTarget,
) => {
  if (config.runtime !== 'orvilo') return false;
  if (config.engine !== undefined && config.engine !== engine) return false;
  if (target.kind === 'sandbox') return config.target === 'sandbox';
  // Server dispatch only reaches user-owned devices — `local` means "the
  // user's own machine" and `device` pins one registered device.
  if (config.target === 'local') return true;
  return config.target === 'device' && config.deviceId === target.deviceId;
};

/**
 * Pick the binding that applies to a spawned run (the union-target selection
 * #367's execAgent gate uses). `config.enabled` is the runtime gate — only a
 * binding verified since its last edit resolves. Candidates are evaluated in
 * `updatedAt`-descending order, so the most recently saved match wins.
 */
export const selectOrviloProviderBinding = async (
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind | string | null | undefined,
  target: OrviloBindingTarget,
) => {
  const wanted = resolveOrviloEngine(engine);
  const model = new ProviderBindingModel(db, userId);
  const rows = await model.list();
  return rows.find(
    (row) =>
      // `enabled` persists inside config JSONB and is set out-of-band
      // (`ProviderBindingModel.setEnabled`, direct fixtures), outside the
      // `literal(false)` input schema — read the stored value, not the type.
      Boolean(row.config.enabled) && selectionMatches(row.config.selection, wanted, target),
  );
};

/**
 * Mint the spawn-side execution descriptor for a selected binding. Re-reads
 * the row and re-checks the fence (`revision` + `enabled` + credential
 * ownership) so a binding edited, disabled, or deleted between selection and
 * mint never silently issues credentials. Secrets are decrypted only inside
 * this trusted boundary, and only for `device` dispatch where they leave as
 * spawn env / wrapper args over the authenticated channel — `sandbox` issues
 * the descriptor alone (empty `env`/`execArgs`); its credentials are served
 * through the embedded inference broker instead.
 */
const issueByokSpawnExecution = async (
  db: OrviloDatabase,
  userId: string,
  candidate: { id: string; revision: number },
  engine: OrviloEngineKind | string | null | undefined,
  target: OrviloBindingTarget,
): Promise<IssuedByokSpawnExecution | undefined> => {
  const model = new ProviderBindingModel(db, userId);
  const row = await model.find(candidate.id);
  const config = row?.config;
  if (!row || !config || row.revision !== candidate.revision || !Boolean(config.enabled)) {
    return undefined;
  }
  if (!(await model.ownsCredentialReference(config.secretReference))) return undefined;
  const endpoint = config.endpoint.replace(/\/+$/, '');
  let env: Record<string, string> = {};
  let execArgs: string[] = [];
  if (target.kind === 'device') {
    const headers = await resolveProviderCredentialHeaders(db, userId, config.secretReference);
    if (!headers) return undefined;
    ({ env, execArgs } = buildByokExecutionCredentials({
      endpoint,
      engine: resolveOrviloEngine(engine),
      headers,
      model: config.model,
    }));
  }
  return {
    bindingId: row.id,
    endpoint,
    env,
    execArgs,
    model: config.model,
    provider: config.provider,
    revision: row.revision,
  };
};
