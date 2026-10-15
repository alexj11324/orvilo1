import type { ComponentProps } from 'react';

import type { NativeMathRenderer } from '@/components/NativePageEditor/math';

import type { PageEditor } from '../PageEditor';
import type { NativeCompletePageEditorProps } from './NativeCompletePageEditor';

/** Preserve actual legacy public inputs while making the actual math engine
 * explicit. This is not a declaration of browser/interaction parity. */
export function completeNativePageProps(
  legacy: ComponentProps<typeof PageEditor>,
  mathRenderer: NativeMathRenderer,
): NativeCompletePageEditorProps {
  return { ...legacy, mathRenderer };
}
