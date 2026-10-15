import type { ComponentProps } from 'react';

import type LegacyHeader from './index';
import type { NativeAgentDocumentHeaderProps } from './NativeHeader';

/** Preserve the actual existing custom-header call contract, without an SDK
 * editor facade or changes to the default legacy implementation. */
export function agentHeaderPropsToNative(
  props: ComponentProps<typeof LegacyHeader>,
): NativeAgentDocumentHeaderProps {
  return props;
}
export function nativeAgentHeaderPropsToLegacy(
  props: NativeAgentDocumentHeaderProps,
): ComponentProps<typeof LegacyHeader> {
  return props;
}
