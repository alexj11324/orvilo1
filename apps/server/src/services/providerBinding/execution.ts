import type { OrviloEngineKind } from '@orvilo/types';

import { ProviderBindingModel } from '@/database/models/providerBinding';
import type { OrviloDatabase } from '@/database/type';

import { resolveProviderCredentialHeaders } from './controlPlane';

/**
 * BYOK binding → Orvilo-agent execution resolution.
 *
 * Selection convention: a binding applies to a run when its
 * `config.selection` matches the run being dispatched —
 * `runtime: 'orvilo'` (Orvilo-owned harness only; `claude-code`/`codex`
 * bindings target the external CLI configs and are never matched here),
 * `engine` unset or equal to the resolved engine, and `target` matching the
 * dispatch plan: `sandbox` → cloud sandbox, `local`/`device` → device
 * dispatch (`device` additionally requires `selection.deviceId` to equal the
 * plan's device). When several bindings match, the most recently updated
 * wins (`list()` ordering).
 *
 * Issuing is revision-fenced: the candidate's `revision` is re-read at mint
 * time and must still be `enabled` — an edited, disabled, or deleted binding
 * never silently issues credentials. Secrets are decrypted only inside this
 * trusted boundary and leave as spawn env / wrapper args for the Orvilo-owned
 * runtime process (over the authenticated device-dispatch channel or the
 * sandbox env contract) — they are never returned to a client.
 */

export interface OrviloBindingTarget {
  deviceId?: string;
  kind: 'device' | 'sandbox';
}

export interface IssuedByokExecution {
  bindingId: string;
  endpoint: string;
  /** Spawn env minted for the engine's CLI family — carries the credentials. */
  env: Record<string, string>;
  /**
   * Extra `lh hetero exec` wrapper args (`--agent-arg=<native arg>` encoded so
   * wrapper flags like `-c` cannot collide with native ones).
   */
  execArgs: string[];
  model: string;
  provider: string;
  revision: number;
}

export type OrviloBindingResolution =
  | { status: 'none' }
  /** A candidate matched but failed the mint-time fence (stale/disabled/gone). */
  | { status: 'unavailable' }
  | { status: 'applied'; execution: IssuedByokExecution };

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
  config: {
    engine?: 'claude-sdk' | 'codex-app-server';
    runtime: 'claude-code' | 'codex' | 'orvilo';
    target: 'device' | 'local' | 'sandbox';
    deviceId?: string;
  },
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
 * Pick the binding that applies to this run (see the selection convention
 * above). Candidates are evaluated in `updatedAt`-descending order.
 */
export const selectOrviloProviderBinding = async (
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind,
  target: OrviloBindingTarget,
) => {
  const model = new ProviderBindingModel(db, userId);
  const rows = await model.list();
  return rows.find(
    (row) => row.config.enabled === true && selectionMatches(row.config.selection, engine, target),
  );
};

/**
 * Mint the execution descriptor for a selected binding. Re-reads the row and
 * re-checks the fence (`revision` + `enabled` + credential ownership) so a
 * binding edited, disabled, or deleted between selection and mint never
 * issues credentials. Returns undefined when the fence trips.
 */
export const issueBindingExecution = async (
  db: OrviloDatabase,
  userId: string,
  candidate: { id: string; revision: number },
  engine: OrviloEngineKind,
): Promise<IssuedByokExecution | undefined> => {
  const model = new ProviderBindingModel(db, userId);
  const row = await model.find(candidate.id);
  const config = row?.config;
  if (!row || !config || row.revision !== candidate.revision || config.enabled !== true) {
    return undefined;
  }
  if (!(await model.ownsCredentialReference(config.secretReference))) return undefined;
  const headers = await resolveProviderCredentialHeaders(db, userId, config.secretReference);
  if (!headers) return undefined;
  const endpoint = config.endpoint.replace(/\/+$/, '');
  const { env, execArgs } = buildByokExecutionCredentials({
    endpoint,
    engine,
    headers,
    model: config.model,
  });
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

/**
 * Select + issue in one step. `unavailable` distinguishes "a binding matched
 * but could not issue credentials" from "no binding applies" — callers must
 * fail the run loudly rather than fall back to another provider account.
 */
export const resolveOrviloProviderBinding = async (
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind,
  target: OrviloBindingTarget,
): Promise<OrviloBindingResolution> => {
  const candidate = await selectOrviloProviderBinding(db, userId, engine, target);
  if (!candidate) return { status: 'none' };
  const execution = await issueBindingExecution(
    db,
    userId,
    { id: candidate.id, revision: candidate.revision },
    engine,
  );
  if (!execution) return { status: 'unavailable' };
  return { execution, status: 'applied' };
};
