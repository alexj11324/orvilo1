import type { Kernel } from '@lobehub/editor';
import type { createHeadlessEditor } from '@lobehub/editor/headless';

import type { EditorRuntimePort } from '../EditorRuntime';

/** Compile this precise API contract independently or through CI. No cast,
 * dispatch mock, protected-class escape or production DocumentStore widening. */
export function editorRuntimePortContract(
  publicKernel: Kernel,
  headlessKernel: ReturnType<typeof createHeadlessEditor>['kernel'],
): { publicEditor: EditorRuntimePort; headlessEditor: EditorRuntimePort } {
  const publicEditor: EditorRuntimePort = publicKernel;
  const headlessEditor: EditorRuntimePort = headlessKernel;
  return { publicEditor, headlessEditor };
}
