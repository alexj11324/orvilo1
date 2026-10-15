import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import type { StoreApi } from 'zustand/vanilla';

import type { Store } from '../store/action';

/** One mounted composer may release only the backend it actually registered. */
export function bindNativeComposer(
  api: Pick<StoreApi<Store>, 'getState' | 'setState'>,
  editor: NativeIEditorKernel,
): () => void {
  api.setState({ nativeComposer: editor, _savedEditorState: undefined });
  return () => {
    if (api.getState().nativeComposer === editor) api.setState({ nativeComposer: undefined });
  };
}
