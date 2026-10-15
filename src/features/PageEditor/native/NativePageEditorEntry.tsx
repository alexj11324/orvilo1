'use client';

import type { NativeMathRenderer } from '@/components/NativePageEditor/math';

import type { PageEditorProps } from '../PageEditor';
import { NativeCompletePageEditor } from './NativeCompletePageEditor';
import { completeNativePageProps } from './NativeCompletePageEditor.contract';

export interface NativePageEditorEntryProps extends PageEditorProps {
  mathRenderer: NativeMathRenderer;
}
/** Real production-entry adapter. A required math implementation and explicit
 * custom native header keep the full page/comments/history assembly intact. */
export function NativePageEditorEntry({ mathRenderer, ...props }: NativePageEditorEntryProps) {
  return <NativeCompletePageEditor {...completeNativePageProps(props, mathRenderer)} />;
}
