import {
  type CustomPluginParams,
  type OrviloToolCustomPlugin,
  type ToolManifest,
} from '@orvilo/types';
import { merge } from '@orvilo/utils';
import { get, set } from 'es-toolkit/compat';
import isEqual from 'fast-deep-equal';
import { type FieldPath, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { safeParseJSON } from '@/utils/safeParseJSON';

// (McpConfig, McpServers, ParsedMcpInput interface definitions remain unchanged)
interface McpConfig {
  args?: string[];
  command?: string;
  url?: string;
}

interface McpServers {
  [key: string]: McpConfig;
}

interface ParsedMcpInput {
  manifest?: ToolManifest;
  mcpServers?: McpServers;
}

// Removed DuplicateIdentifier
export enum McpParseErrorCode {
  EmptyMcpServers = 'EmptyMcpServers',
  InvalidJsonStructure = 'InvalidJsonStructure',
  InvalidMcpStructure = 'InvalidMcpStructure',
  ManifestNotSupported = 'ManifestNotSupported',
}

// Removed isDuplicate
interface ParseSuccessResult {
  identifier: string;
  mcpConfig: McpConfig & { type: 'stdio' | 'http' };
  status: 'success';
}

interface ParseErrorResult {
  errorCode: McpParseErrorCode;
  // identifier field may still be useful for displaying the user-input ID when structure errors occur
  identifier?: string;
  status: 'error';
}

interface ParseNoOpResult {
  status: 'noop';
}

export type ParseResult = ParseSuccessResult | ParseErrorResult | ParseNoOpResult;

export const parseMcpInput = (value: string): ParseResult => {
  const parsedJson = safeParseJSON<ParsedMcpInput | McpServers>(value);

  if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
    // 1. Check for the nested "mcpServers" structure
    if (
      'mcpServers' in parsedJson &&
      typeof parsedJson.mcpServers === 'object' &&
      parsedJson.mcpServers !== null
    ) {
      const mcpKeys = Object.keys(parsedJson.mcpServers);

      if (mcpKeys.length > 0) {
        const identifier = mcpKeys[0];
        // @ts-expect-error type mismatch
        const mcpConfig = parsedJson.mcpServers[identifier];

        if (mcpConfig && typeof mcpConfig === 'object' && !Array.isArray(mcpConfig)) {
          let resultMcpConfig: McpConfig & { type?: 'stdio' | 'http' };

          if (mcpConfig.command && Array.isArray(mcpConfig.args)) {
            resultMcpConfig = { ...mcpConfig, type: 'stdio' };
          } else if (mcpConfig.url) {
            resultMcpConfig = { type: 'http', url: mcpConfig.url };
          } else {
            return {
              errorCode: McpParseErrorCode.InvalidMcpStructure,
              identifier,
              status: 'error',
            };
          }

          return {
            identifier,
            mcpConfig: resultMcpConfig as McpConfig & { type: 'stdio' | 'http' },
            status: 'success',
          };
        }
        // mcpConfig is invalid or not an object
        return {
          errorCode: McpParseErrorCode.InvalidMcpStructure,
          identifier,
          status: 'error',
        };
      } else {
        // mcpServers object is empty
        return { errorCode: McpParseErrorCode.EmptyMcpServers, status: 'error' };
      }
    }
    // 3. Check for the flat structure (identifier as top-level key)
    else {
      const topLevelKeys = Object.keys(parsedJson);

      // Allow exactly one top-level key which is the identifier
      if (topLevelKeys.length === 1) {
        const identifier = topLevelKeys[0];
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        const mcpConfig = (parsedJson as any)[identifier];

        if (mcpConfig && typeof mcpConfig === 'object' && !Array.isArray(mcpConfig)) {
          let resultMcpConfig: McpConfig & { type?: 'stdio' | 'http' };

          // Explicitly check properties of mcpConfig
          if (mcpConfig.command && Array.isArray(mcpConfig.args)) {
            resultMcpConfig = { ...mcpConfig, type: 'stdio' };
          } else if (mcpConfig.url) {
            // For the flat structure, ensure only 'url' is included for http type
            resultMcpConfig = { type: 'http', url: mcpConfig.url };
          } else {
            // Invalid structure within the identifier's value
            return {
              errorCode: McpParseErrorCode.InvalidMcpStructure,
              identifier, // We have the identifier here
              status: 'error',
            };
          }

          // Structure parsed successfully
          return {
            identifier,
            mcpConfig: resultMcpConfig as McpConfig & { type: 'stdio' | 'http' },
            status: 'success',
          };
        } else {
          // The value associated with the single key is not a valid config object
          return { errorCode: McpParseErrorCode.InvalidMcpStructure, identifier, status: 'error' };
        }
      } else {
        // Neither mcpServers nor manifest, and not a single top-level key structure
        return { errorCode: McpParseErrorCode.InvalidJsonStructure, status: 'error' };
      }
    }
  }

  // Input is not a valid JSON object or failed safeParseJSON
  return { status: 'noop' }; // Or potentially InvalidJsonStructure if safeParse failed but wasn't null/undefined?
};

// The form retains inactive transport/auth values, but the old Form submitted
// only mounted fields. Keep validation, draft retention and payload projection
// separate; schemas validate raw values without trimming or transforming them.
type McpParams = NonNullable<CustomPluginParams['mcp']>;
type McpAuth = NonNullable<McpParams['auth']>;
export interface McpDevFormValues extends Omit<Partial<OrviloToolCustomPlugin>, 'customParams'> {
  customParams?: Omit<CustomPluginParams, 'mcp'> & {
    mcp?: Omit<Partial<McpParams>, 'auth'> & { auth?: Partial<McpAuth> };
  };
}
export type McpDevForm = UseFormReturn<McpDevFormValues>;

export const MCP_DEV_FIELDS = [
  'identifier',
  'manifest',
  'customParams.description',
  'customParams.avatar',
  'customParams.mcp.type',
  'customParams.mcp.url',
  'customParams.mcp.command',
  'customParams.mcp.args',
  'customParams.mcp.env',
  'customParams.mcp.headers',
  'customParams.mcp.auth.type',
  'customParams.mcp.auth.token',
  'customParams.mcp.auth.clientId',
  'customParams.mcp.auth.clientSecret',
] as const satisfies readonly FieldPath<McpDevFormValues>[];

export const createMcpDevDefaults = (): McpDevFormValues => ({
  customParams: { mcp: { auth: { type: 'none' }, type: 'http' } },
});

export const getMcpDevActiveFields = (values: McpDevFormValues, enableOAuth = false) => {
  const fields: FieldPath<McpDevFormValues>[] = [
    'identifier',
    'manifest',
    'customParams.description',
    'customParams.avatar',
    'customParams.mcp.type',
  ];
  const mcp = values.customParams?.mcp;
  if (mcp?.type === 'http') {
    fields.push('customParams.mcp.url', 'customParams.mcp.headers', 'customParams.mcp.auth.type');
    if (mcp.auth?.type === 'bearer') fields.push('customParams.mcp.auth.token');
    if (enableOAuth && mcp.auth?.type === 'oauth2') {
      fields.push('customParams.mcp.auth.clientId', 'customParams.mcp.auth.clientSecret');
    }
  } else if (mcp?.type === 'stdio') {
    fields.push('customParams.mcp.command', 'customParams.mcp.args', 'customParams.mcp.env');
  }
  return fields;
};

export interface McpDevPayload {
  customParams: {
    avatar?: string;
    description?: string;
    mcp: NonNullable<NonNullable<McpDevFormValues['customParams']>['mcp']>;
  };
  identifier?: string;
  manifest?: ToolManifest;
}

export const getMcpDevPayload = (
  values: McpDevFormValues,
  enableOAuth = false,
  mountedFields: readonly FieldPath<McpDevFormValues>[] = getMcpDevActiveFields(
    values,
    enableOAuth,
  ),
): McpDevPayload => {
  // Explicit mounted-field authority also handles advanced sections: a closed
  // headers editor retains its draft but is not a submitted field.
  const payload: McpDevFormValues = {};
  mountedFields.forEach((name) => set(payload, name, get(values, name)));
  return payload as McpDevPayload;
};

export const getMcpDevTestFields = (values: McpDevFormValues) => {
  const mcp = values.customParams?.mcp;
  const fields: FieldPath<McpDevFormValues>[] =
    mcp?.type === 'http'
      ? ['customParams.mcp.url', 'customParams.mcp.auth.type']
      : ['customParams.mcp.command', 'customParams.mcp.args'];
  if (mcp?.type === 'http' && mcp.auth?.type === 'bearer')
    fields.push('customParams.mcp.auth.token');
  return fields;
};

export const mergeMcpDevValues = (
  values: McpDevFormValues,
  patch: McpDevFormValues,
): McpDevFormValues => {
  const next = { ...values, ...patch };
  if (patch.manifest) next.manifest = merge(values.manifest ?? {}, patch.manifest);
  if (patch.customParams) {
    next.customParams = { ...values.customParams, ...patch.customParams };
    const priorMcp = values.customParams?.mcp;
    const patchMcp = patch.customParams.mcp;
    if (patchMcp) {
      next.customParams.mcp = { ...priorMcp, ...patchMcp };
      if (patchMcp.auth) next.customParams.mcp.auth = { ...priorMcp?.auth, ...patchMcp.auth };
      if (patchMcp.env) next.customParams.mcp.env = merge(priorMcp?.env ?? {}, patchMcp.env);
      if (patchMcp.headers)
        next.customParams.mcp.headers = merge(priorMcp?.headers ?? {}, patchMcp.headers);
    }
  }
  return next;
};

export const setMcpDevValues = (
  form: Pick<McpDevForm, 'getValues' | 'reset' | 'clearErrors'>,
  patch: McpDevFormValues,
) => {
  // reset accepts explicit undefined (setValue's public contract does not).
  // Retain draft metadata and clear errors only for externally changed fields.
  const prior = form.getValues();
  const next = mergeMcpDevValues(prior, patch);
  form.reset(next, {
    keepDefaultValues: true,
    keepDirty: true,
    keepErrors: true,
    keepFieldsRef: true,
    keepIsSubmitted: true,
    keepSubmitCount: true,
    keepTouched: true,
  });
  form.clearErrors(MCP_DEV_FIELDS.filter((name) => !isEqual(get(prior, name), get(next, name))));
};

const identifierSchema = z
  .string({ error: 'dev.mcp.identifier.required' })
  .min(1, 'dev.mcp.identifier.required')
  .regex(/^[\w-]+$/, 'dev.mcp.identifier.invalid');
const urlSchema = z
  .string({ error: 'dev.mcp.url.required' })
  .min(1, 'dev.mcp.url.required')
  .refine((value) => {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, 'dev.mcp.url.invalid');
const requiredSchema = z.custom(
  (value) =>
    value !== undefined &&
    value !== null &&
    value !== '' &&
    (!Array.isArray(value) || value.length > 0),
);

export const validateMcpIdentifier = (
  value: unknown,
  pluginIds: readonly string[],
  isEditMode = false,
) => {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success)
    return parsed.error.issues[0].message as
      'dev.mcp.identifier.required' | 'dev.mcp.identifier.invalid';
  return !isEditMode && pluginIds.includes(parsed.data)
    ? 'dev.meta.identifier.errorDuplicate'
    : undefined;
};
export const validateMcpUrl = (value: unknown) => {
  const parsed = urlSchema.safeParse(value);
  return parsed.success
    ? undefined
    : (parsed.error.issues[0].message as 'dev.mcp.url.required' | 'dev.mcp.url.invalid');
};
export const isMcpRequiredValuePresent = (value: unknown) =>
  requiredSchema.safeParse(value).success;
