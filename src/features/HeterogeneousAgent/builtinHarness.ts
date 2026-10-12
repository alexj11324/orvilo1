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

/**
 * Whether an Agent named by id is withheld: a built-in Agent, or a listed one
 * on a runtime that is not offered. An Agent the reader's list does not carry
 * is left alone, since nothing is known about its runtime.
 */
export const isAgentWithheld = (params: {
  builtinOffered: boolean;
  isBuiltinAgent: boolean;
  listed?: { heterogeneousType?: string | null };
}): boolean =>
  !params.builtinOffered &&
  (params.isBuiltinAgent ||
    (!!params.listed && !isAgentRuntimeOffered(params.listed.heterogeneousType, false)));
