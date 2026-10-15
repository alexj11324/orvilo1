/** Explicit SDK compatibility entry. Native/server imports never traverse it. */
import {
  LITEXML_APPLY_COMMAND,
  LITEXML_MODIFY_COMMAND,
  LITEXML_MODIFY_WITH_RESULTS_COMMAND,
} from '@lobehub/editor/litexml-commands';

import {
  EditorRuntime,
  type EditorRuntimeCommandBindings,
  type EditorRuntimePort,
} from './EditorRuntime';

export const legacyEditorRuntimeCommands: EditorRuntimeCommandBindings = {
  apply: LITEXML_APPLY_COMMAND,
  modify: LITEXML_MODIFY_COMMAND,
  modifyWithResults: LITEXML_MODIFY_WITH_RESULTS_COMMAND,
};

/** Full retained SDK behavior, explicitly isolated from the owned runtime graph. */
export class LegacyEditorRuntime extends EditorRuntime {
  override setEditor(editor: EditorRuntimePort | null, commands = legacyEditorRuntimeCommands) {
    super.setEditor(editor, commands);
  }
}
