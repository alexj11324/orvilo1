import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { isRecord } from '@orvilo/utils/object';

/** Public business surface shared by the actual SDK and native composer.
 * No private data-source map, renderer context, SDK node or nominal cast. */
export interface ComposerProtocol extends Pick<
  NativeIEditorKernel,
  | 'cleanDocument'
  | 'dispatchCommand'
  | 'focus'
  | 'getLexicalEditor'
  | 'getRootElement'
  | 'getSelectionDocument'
  | 'isEditable'
  | 'isEmpty'
  | 'setDocument'
> {
  getDocument: (type: string) => unknown;
}
export function activeComposer(state: {
  editor?: ComposerProtocol;
  nativeComposer?: ComposerProtocol;
}): ComposerProtocol | undefined {
  return state.nativeComposer ?? state.editor;
}
export function composerJSON(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
