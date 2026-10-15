import type { EditorRuntimePort } from '@orvilo/editor-runtime';
import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';

import type { DocumentEditorPort } from '@/store/document/types';

/** Native host requires structural document/runtime capabilities, never SDK IEditor. */
export function nativePageHostContract(editor: NativeIEditorKernel): {
  document: DocumentEditorPort;
  runtime: EditorRuntimePort;
} {
  return { document: editor, runtime: editor };
}
