import type { EditorRuntimeCommandBindings, EditorRuntimePort } from '../EditorRuntime';
import type { createHeadlessEditor } from '../native-headless';
import { nativeEditorRuntimeCommands } from '../native-headless/runtimeCommands';

/** Check against the current owned port, never the obsolete full SDK IEditor.
 * This fixture must compile after the authorized local package graph is wired. */
export function nativeServerPortContract(
  editor: ReturnType<typeof createHeadlessEditor>['kernel'],
): { editor: EditorRuntimePort; commands: EditorRuntimeCommandBindings } {
  const backend: EditorRuntimePort = editor;
  const commands: EditorRuntimeCommandBindings = nativeEditorRuntimeCommands;
  return { editor: backend, commands };
}
