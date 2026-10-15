import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { useEffect, useState } from 'react';

export function useNativeEditable(editor: NativeIEditorKernel) {
  const [editable, setEditable] = useState(() => editor.isEditable());
  useEffect(() => {
    editor.on('editableChange', setEditable);
    setEditable(editor.isEditable());
    return () => {
      editor.off('editableChange', setEditable);
    };
  }, [editor]);
  return editable;
}
