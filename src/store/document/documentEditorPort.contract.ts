import type { Kernel } from '@lobehub/editor';
import type { createHeadlessEditor } from '@lobehub/editor/headless';

import type { DocumentEditorPort } from './types';

/** Compile-only structural contract: real public and headless SDK declarations,
 * without protected DataSource classes, casts, or command remapping. */
export function documentEditorPortContract(
  publicKernel: Kernel,
  headlessKernel: ReturnType<typeof createHeadlessEditor>['kernel'],
): { publicEditor: DocumentEditorPort; headlessEditor: DocumentEditorPort } {
  return { publicEditor: publicKernel, headlessEditor: headlessKernel };
}

export function documentEditorPortWriteContract(editor: DocumentEditorPort): void {
  editor.setDocument('markdown', 'text');
  editor.setDocument('json', '{"root":{}}', { keepId: true });
  // @ts-expect-error Document format names retain the actual string contract.
  editor.setDocument(42, 'text');
  // @ts-expect-error Document options retain the actual keepId boolean contract.
  editor.setDocument('json', '{"root":{}}', { keepId: 42 });
  // @ts-expect-error Export values require the existing consumer narrowing.
  const text: string = editor.getDocument('markdown');
  void text;
}
