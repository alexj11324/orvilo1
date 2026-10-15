import { $wrapNodeInElement } from '@lexical/utils';
import {
  $createParagraphNode,
  $insertNodes,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
} from 'lexical';

import { $createActionTagNode } from '../InputEditor/ActionTag/ActionTagNode';
import { INSERT_ACTION_TAG_COMMAND } from '../InputEditor/ActionTag/command';

export function registerActionTagCommand(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    INSERT_ACTION_TAG_COMMAND,
    (payload) => {
      if (!editor.isEditable()) return true;
      editor.update(() => {
        if (!editor.isEditable()) return;
        const node = $createActionTagNode(payload.type, payload.category, payload.label);
        $insertNodes([node]);
        if ($isRootOrShadowRoot(node.getParentOrThrow())) {
          $wrapNodeInElement(node, $createParagraphNode).selectEnd();
        }
      });
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );
}
