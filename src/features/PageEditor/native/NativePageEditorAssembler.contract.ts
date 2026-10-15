import type { ComponentProps } from 'react';

import type { PageEditor } from '../PageEditor';
import type { NativePageEditorPublicProps } from './NativePageEditorAssembler';

/** Real legacy/public prop compatibility, not a second hand-written fixture.
 * parentId is an additive native prop already present on the legacy provider. */
export function legacyPagePropsToNative(
  props: ComponentProps<typeof PageEditor>,
): NativePageEditorPublicProps {
  return props;
}
export function nativePagePropsToLegacy(
  props: NativePageEditorPublicProps,
): ComponentProps<typeof PageEditor> {
  return props;
}
