import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import { isBuiltinEngineType } from './engine';

/**
 * Whether the built-in harness is offered. It rides the provider-settings
 * surface: the harness cannot run without a model provider, so a deployment
 * that withholds one withholds the other.
 */
export const isBuiltinHarnessOffered = (flags: { showProvider?: boolean }): boolean =>
  !!flags.showProvider;

export const useBuiltinHarnessOffered = (): boolean =>
  useServerConfigStore((s) => isBuiltinHarnessOffered(featureFlagsSelectors(s)));

/**
 * Whether an agent on this runtime is offered. An agent with no runtime stamp
 * predates harness selection and runs on the built-in one, so it is withheld
 * together with agents stamped as built-in.
 */
export const isAgentRuntimeOffered = (
  type: string | null | undefined,
  builtinOffered: boolean,
): boolean => builtinOffered || (!!type && !isBuiltinEngineType(type));
