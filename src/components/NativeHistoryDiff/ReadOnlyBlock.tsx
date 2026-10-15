'use client';

import type { NativeIPlugin } from '@orvilo/editor-runtime/native-browser';
import { useEffect, useRef, useState } from 'react';

import { useNativeFileOwner } from '@/components/NativePageEditor/file';
import { createNativeImageOwner } from '@/components/NativePageEditor/image';
import {
  createNativeBrowserEditor,
  type NativeEditorWidgets,
} from '@/components/NativePageEditor/session';
import { NativeEditorSurface } from '@/components/NativePageEditor/surface';
import { useFileUpload, useImageUpload } from '@/features/EditorCanvas/useImageUpload';

/** An isolated read-only native document. Never binds the active document store,
 * Copilot runtime, autosave, route lifecycle or native mutation callbacks. */
export function ReadOnlyNativeDiffBlock({
  content,
  widgets,
  plugins,
  label,
}: {
  content: unknown;
  label: string;
  plugins?: NativeIPlugin[];
  widgets: NativeEditorWidgets;
}) {
  const uploadFile = useFileUpload();
  const uploadImage = useImageUpload();
  const fileOwner = useNativeFileOwner(uploadFile, { file: 'native-editor-file' });
  const imageOwner = createNativeImageOwner(uploadImage);
  const live = useRef({ widgets, fileOwner, imageOwner });
  live.current = { widgets, fileOwner, imageOwner };
  const [editor] = useState(() =>
    createNativeBrowserEditor(
      () => live.current.widgets,
      () => live.current.fileOwner,
      () => live.current.imageOwner,
      plugins,
    ),
  );
  const [lifetime] = useState(() => ({ generation: 0 }));
  useEffect(() => {
    const generation = ++lifetime.generation;
    return () => {
      queueMicrotask(() => {
        if (lifetime.generation === generation) editor.destroy();
      });
    };
  }, [editor, lifetime]);
  return (
    <NativeEditorSurface
      content={content}
      editable={false}
      editor={editor}
      label={label}
      type="json"
    />
  );
}
