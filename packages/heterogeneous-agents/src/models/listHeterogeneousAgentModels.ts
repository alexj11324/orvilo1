import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  HeterogeneousAgentModel,
  HeterogeneousAgentModelCatalog,
  ListHeterogeneousAgentModelsParams,
} from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';

import { resolveCliSpawnPlan } from '../spawn/cliSpawn';
import { listDroidAcpModels } from '../spawn/droidAcpSession';
import { resolveHeteroSpawnCommand } from '../spawn/resolveCliCommand';
import { listTraeAcpModels } from '../spawn/traeAcpSession';
import { staticModelCatalog } from './staticCatalogs';

const execFilePromise = promisify(execFile);
const MODEL_CATALOG_MAX_BUFFER = 256 * 1024;
const MODEL_CATALOG_TIMEOUT_MS = 15_000;
const CODEX_DEBUG_MODELS_ARGS = ['debug', 'models', '--bundled'] as const;
const CODEBUDDY_MODEL_OPTION = '--model <model>';
const CODEBUDDY_SUPPORTED_MODELS_LABEL = 'Currently supported:';
const CURSOR_MODEL_ANNOTATIONS = [' (current)', ' (default)'] as const;
const CURSOR_MODEL_ID_PATTERN = /^[A-Z0-9][\w./:@+-]*$/i;
const GROK_MODEL_ID_PATTERN = /^[A-Z0-9][\w./:@+-]*$/i;
const OPENCODE_MODEL_ID_PATTERN = /^[A-Z0-9][\w.-]*\/[A-Z0-9@][\w./:@+-]*$/i;
const PI_MODEL_ROW_PATTERN = /^(\S+)\s{2,}(\S+)\s{2,}\S+\s{2,}\S+\s{2,}(?:yes|no)\s{2,}(?:yes|no)$/;
const QODER_CUSTOM_MODEL_ROW_PATTERN = /^(.+?) \(([^()\s]+)\)$/;

const parseCodeBuddyModelCatalogResult = (
  output: string,
): HeterogeneousAgentModel[] | undefined => {
  const modelOptionIndex = output.indexOf(CODEBUDDY_MODEL_OPTION);
  if (modelOptionIndex < 0) return;

  const labelStart = output.indexOf(
    CODEBUDDY_SUPPORTED_MODELS_LABEL,
    modelOptionIndex + CODEBUDDY_MODEL_OPTION.length,
  );
  if (labelStart < 0) return;

  const labelEnd = labelStart + CODEBUDDY_SUPPORTED_MODELS_LABEL.length;
  const modelsStart = output.indexOf('(', labelEnd);
  if (modelsStart < 0 || output.slice(labelEnd, modelsStart).trim()) return;

  const modelsEnd = output.indexOf(')', modelsStart + 1);
  if (modelsEnd < 0) return;

  const supportedModels = output.slice(modelsStart + 1, modelsEnd);
  const modelIds = supportedModels.split(',').map((model) => model.trim());
  if (modelIds.some((id) => !id)) return;

  return [...new Set(modelIds)]
    .filter((id) => id !== 'default-model')
    .map((id) => ({ id, modelId: id, providerId: 'codebuddy' }));
};

/** Parse the model IDs accepted by CodeBuddy's native `--model` option. */
export const parseCodeBuddyModelCatalog = (output: string): HeterogeneousAgentModel[] =>
  parseCodeBuddyModelCatalogResult(output) ?? [];

/** Parse the `model-slug - Display Label` rows emitted by Cursor Agent. */
export const parseCursorModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf(' - ');
    if (separatorIndex <= 0) continue;

    let id = line.slice(0, separatorIndex).trim();
    const annotation = CURSOR_MODEL_ANNOTATIONS.find((item) => id.endsWith(item));
    if (annotation) id = id.slice(0, -annotation.length);
    const label = line.slice(separatorIndex + 3).trim();
    if (!CURSOR_MODEL_ID_PATTERN.test(id) || !label || seen.has(id)) continue;

    seen.add(id);
    models.push({ id, label, modelId: id, providerId: 'cursor' });
  }

  return models;
};

export const parseDevinModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  let result: unknown;
  try {
    result = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!isRecord(result) || !Array.isArray(result.families)) return [];

  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];
  for (const family of result.families) {
    if (!isRecord(family) || !Array.isArray(family.variants)) continue;
    for (const variant of family.variants) {
      if (!isRecord(variant) || typeof variant.model_uid !== 'string' || !variant.model_uid)
        continue;
      if (seen.has(variant.model_uid)) continue;

      seen.add(variant.model_uid);
      models.push({
        id: variant.model_uid,
        ...(typeof variant.label === 'string' && variant.label
          ? { label: variant.label }
          : undefined),
        modelId: variant.model_uid,
        providerId: 'devin',
      });
    }
  }

  return models;
};

/** Parse the model rows emitted by `grok models`. */
export const parseGrokBuildModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^[*>•✓-]\s*/, '')
      .replace(/ \((?:current|default)\)$/, '');
    const separatorIndex = line.search(/\s{2}/);
    const id = (separatorIndex < 0 ? line : line.slice(0, separatorIndex)).trim();
    if (!GROK_MODEL_ID_PATTERN.test(id)) continue;

    if (id.toLowerCase() === 'model' || id.toLowerCase() === 'models' || seen.has(id)) continue;

    const label = (separatorIndex < 0 ? '' : line.slice(separatorIndex).trim())
      .replaceAll(' (current)', '')
      .replaceAll(' (default)', '')
      .trim();
    seen.add(id);
    models.push({
      id,
      ...(label ? { label } : {}),
      modelId: id,
      providerId: 'grok-build',
    });
  }

  return models;
};

export const parseOpenCodeModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const id = rawLine.trim().split(/\s+/, 1)[0] ?? '';
    const separatorIndex = id.indexOf('/');
    if (!OPENCODE_MODEL_ID_PATTERN.test(id) || separatorIndex <= 0 || seen.has(id)) continue;

    seen.add(id);
    models.push({
      id,
      modelId: id.slice(separatorIndex + 1),
      providerId: id.slice(0, separatorIndex),
    });
  }

  return models;
};

/** Parse `codex debug models --bundled` JSON. Hidden slugs stay out of the picker. */
export const parseCodexModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.models)
      ? parsed.models
      : [];
  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = typeof row.slug === 'string' ? row.slug.trim() : '';
    if (!id || row.visibility === 'hide' || seen.has(id)) continue;

    const label = typeof row.display_name === 'string' ? row.display_name.trim() : '';
    seen.add(id);
    models.push({
      id,
      ...(label ? { label } : {}),
      modelId: id,
      providerId: 'openai',
    });
  }

  return models;
};

/** Parse the fixed-width table emitted by `pi --list-models`. */
export const parsePiModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const match = PI_MODEL_ROW_PATTERN.exec(rawLine.trim());
    if (!match) continue;

    const [, providerId, modelId] = match;
    const id = `${providerId}/${modelId}`;
    if (providerId === 'provider' || seen.has(id)) continue;

    seen.add(id);
    models.push({ id, modelId, providerId });
  }

  return models;
};

/**
 * Parse the one-column table emitted by `qodercli --list-models`.
 * Built-in models are selected by name; custom models append their modelID in
 * parentheses and must be selected by that id.
 */
export const parseQoderModelCatalog = (stdout: string): HeterogeneousAgentModel[] => {
  const seen = new Set<string>();
  const models: HeterogeneousAgentModel[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === 'MODEL') continue;

    const match = QODER_CUSTOM_MODEL_ROW_PATTERN.exec(line);
    const id = match?.[2] ?? line;
    // Qoder truncates model IDs longer than 40 characters in this human-readable
    // command. Do not persist an id that the native `--model` flag cannot resolve.
    if (id.endsWith('…') || seen.has(id)) continue;

    seen.add(id);
    models.push({
      id,
      ...(match?.[1] ? { label: match[1] } : {}),
      modelId: id,
      providerId: 'qoder',
    });
  }

  return models;
};

const getErrorRecord = (error: unknown) =>
  error as {
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };

const catalogSuccess = (
  models: HeterogeneousAgentModel[],
  updatedAt: number,
): HeterogeneousAgentModelCatalog => ({ models, status: 'success', updatedAt });

const runCatalogCommand = async ({
  args,
  command,
  cwd,
  env,
}: {
  args: string[];
  command: string;
  cwd?: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ stderr: string; stdout: string }> => {
  const spawnPlan = await resolveCliSpawnPlan(command, args);
  try {
    const { stderr, stdout } = await execFilePromise(spawnPlan.command, spawnPlan.args, {
      cwd,
      encoding: 'utf8',
      env,
      maxBuffer: MODEL_CATALOG_MAX_BUFFER,
      timeout: MODEL_CATALOG_TIMEOUT_MS,
      windowsHide: true,
    });
    return { stderr: String(stderr), stdout: String(stdout) };
  } catch (error) {
    const record = getErrorRecord(error);
    return {
      stderr: String(record.stderr ?? ''),
      stdout: String(record.stdout ?? ''),
    };
  }
};

/**
 * Query the model catalog from the same host that will execute the agent.
 *
 * Callers own construction of the full child environment so Desktop can apply
 * the same inherited-env stripping/proxy rules as a real session while `orvilo
 * connect` can use its daemon environment. Resolver-discovered PATH is merged
 * underneath explicit caller values.
 *
 * Discovery uses the vendor CLI (or a baked-in list for Claude Code). A missing
 * binary, timeout, or empty parse still returns `status: 'success'` with an
 * empty list so the picker keeps the runtime default.
 */
export const listHeterogeneousAgentModels = async (
  params: ListHeterogeneousAgentModelsParams,
): Promise<HeterogeneousAgentModelCatalog> => {
  const updatedAt = Date.now();
  if (params.type === 'claude-code') {
    return catalogSuccess(staticModelCatalog('claude-code'), updatedAt);
  }

  try {
    const resolved = await resolveHeteroSpawnCommand(params.type, params.command);
    const callerEnv = params.env ?? process.env;
    const mergedPath = [
      ...new Set(
        [callerEnv.PATH, resolved.pathEnv]
          .filter(Boolean)
          .join(path.delimiter)
          .split(path.delimiter),
      ),
    ]
      .filter(Boolean)
      .join(path.delimiter);
    const env = {
      ...callerEnv,
      ...(mergedPath ? { PATH: mergedPath } : {}),
    } as NodeJS.ProcessEnv;

    const run = (args: string[]) =>
      runCatalogCommand({
        args,
        command: resolved.command,
        cwd: params.cwd,
        env,
      });

    if (params.type === 'codex') {
      const { stdout } = await run([...CODEX_DEBUG_MODELS_ARGS]);
      const models = parseCodexModelCatalog(stdout);
      return catalogSuccess(models.length > 0 ? models : staticModelCatalog('codex'), updatedAt);
    }

    if (params.type === 'opencode') {
      const verbose = parseOpenCodeModelCatalog((await run(['models', '--verbose'])).stdout);
      if (verbose.length > 0) return catalogSuccess(verbose, updatedAt);
      return catalogSuccess(parseOpenCodeModelCatalog((await run(['models'])).stdout), updatedAt);
    }

    if (params.type === 'droid') {
      try {
        return catalogSuccess(
          await listDroidAcpModels({
            args: params.args,
            commandPath: resolved.command,
            cwd: params.cwd ?? process.cwd(),
            env,
            timeoutMs: MODEL_CATALOG_TIMEOUT_MS,
          }),
          updatedAt,
        );
      } catch {
        return catalogSuccess([], updatedAt);
      }
    }

    if (params.type === 'trae') {
      try {
        return catalogSuccess(
          await listTraeAcpModels({
            args: params.args,
            commandPath: resolved.command,
            cwd: params.cwd ?? process.cwd(),
            env,
            timeoutMs: MODEL_CATALOG_TIMEOUT_MS,
          }),
          updatedAt,
        );
      } catch {
        return catalogSuccess([], updatedAt);
      }
    }

    const args =
      params.type === 'codebuddy'
        ? ['--help']
        : params.type === 'devin'
          ? ['models', 'list', '--format', 'json']
          : params.type === 'grok-build'
            ? ['models']
            : ['--list-models'];
    const { stderr, stdout } = await run(args);

    if (params.type === 'codebuddy') {
      return catalogSuccess(
        parseCodeBuddyModelCatalogResult(stdout) ?? parseCodeBuddyModelCatalogResult(stderr) ?? [],
        updatedAt,
      );
    }

    return catalogSuccess(
      params.type === 'cursor'
        ? parseCursorModelCatalog(stdout)
        : params.type === 'devin'
          ? parseDevinModelCatalog(stdout)
          : params.type === 'grok-build'
            ? parseGrokBuildModelCatalog(stdout)
            : params.type === 'pi'
              ? parsePiModelCatalog(stdout)
              : parseQoderModelCatalog(stdout),
      updatedAt,
    );
  } catch {
    return catalogSuccess(params.type === 'codex' ? staticModelCatalog('codex') : [], updatedAt);
  }
};
