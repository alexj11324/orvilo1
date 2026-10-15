import {
  LITEXML_APPLY_COMMAND,
  LITEXML_MODIFY_COMMAND,
  LITEXML_MODIFY_WITH_RESULTS_COMMAND,
} from '../../vendor/lobehub-editor-4.29.2/plugins/litexml/command/symbols.js';
import type { EditorRuntimeCommandBindings } from '../EditorRuntime';

/** Every object is the same local object registered by this headless backend. */
export const nativeEditorRuntimeCommands: EditorRuntimeCommandBindings = {
  apply: LITEXML_APPLY_COMMAND,
  modify: LITEXML_MODIFY_COMMAND,
  modifyWithResults: LITEXML_MODIFY_WITH_RESULTS_COMMAND,
};
