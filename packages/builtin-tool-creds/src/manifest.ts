import type { BuiltinToolManifest } from '@orvilo/types';
import type { JSONSchema7 } from 'json-schema';

import { systemPrompt } from './systemRole';
import { CredsApiName } from './types';

export const CredsIdentifier = 'orvilo-creds';

export const CredsManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Inject credentials into the cloud sandbox environment as environment variables. Only useful when the sandbox is reachable this run — check "Cloud sandbox reachable for credential injection" in the session context before calling this. A routed device does not by itself rule this out: in auto mode the cloud sandbox stays reachable alongside a routed device, so the session-context value is the source of truth, not device-routing status alone.',
      name: CredsApiName.injectCredsToSandbox,
      parameters: {
        additionalProperties: false,
        properties: {
          keys: {
            description: 'Array of credential keys to inject into the sandbox',
            items: {
              type: 'string',
            },
            type: 'array',
          },
        },
        required: ['keys'],
        type: 'object',
      } satisfies JSONSchema7,
    },
    {
      description:
        'Save a new credential securely. Use this when the user wants to store sensitive information like API keys, tokens, or secrets. The credential will be encrypted and stored securely.',
      name: CredsApiName.saveCreds,
      parameters: {
        additionalProperties: false,
        properties: {
          description: {
            description: 'Optional description explaining what this credential is used for',
            type: 'string',
          },
          key: {
            description:
              'Unique identifier key for the credential (e.g., "openai", "github-token"). Use lowercase with hyphens.',
            pattern: '^[a-z][a-z0-9-]*$',
            type: 'string',
          },
          name: {
            description: 'Human-readable display name for the credential',
            type: 'string',
          },
          type: {
            description: 'The type of credential being saved',
            enum: ['kv-env', 'kv-header'],
            type: 'string',
          },
          values: {
            additionalProperties: {
              type: 'string',
            },
            description:
              'Key-value pairs of the credential. For kv-env, the key should be the environment variable name (e.g., {"OPENAI_API_KEY": "sk-..."})',
            type: 'object',
          },
        },
        required: ['key', 'name', 'type', 'values'],
        type: 'object',
      } satisfies JSONSchema7,
    },
  ],
  identifier: CredsIdentifier,
  meta: {
    avatar: '🔐',
    description:
      'Manage user credentials for authentication, environment variable injection, and API verification. Use this tool when tasks require API keys, OAuth tokens, or secrets - such as calling third-party APIs, authenticating with external services, or injecting credentials into sandbox environments.',
    title: 'Credentials',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
