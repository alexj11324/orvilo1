'use client';
import type { EditorRuntimeCommandBindings } from '@orvilo/editor-runtime';
import {
  nativeEditorRuntimeCommands,
  type NativeIEditorKernel,
  type NativeIPlugin,
} from '@orvilo/editor-runtime/native-browser';
import { useEffect, useRef, useState } from 'react';

import { useNativeFileOwner } from '@/components/NativePageEditor/file';
import { createNativeImageOwner } from '@/components/NativePageEditor/image';
import {
  createNativeBrowserEditor,
  type NativeEditorWidgets,
} from '@/components/NativePageEditor/session';
import {
  NativeEditorSurface,
  type NativeEditorSurfaceProps,
} from '@/components/NativePageEditor/surface';
import { useFileUpload, useImageUpload } from '@/features/EditorCanvas/useImageUpload';

export interface NativePageEditorProps extends Omit<NativeEditorSurfaceProps, 'editor' | 'onInit'> {
  /** Bind the actual backend commands explicitly; shared Runtime's SDK default
   * must not be used with this native instance. */
  onReady: (editor: NativeIEditorKernel, commands: EditorRuntimeCommandBindings) => void;
  /** Immutable plugin choices for one editor lifetime. */
  plugins?: NativeIPlugin[];
  widgets: NativeEditorWidgets;
}
/** Chat-only mount surface without the document formatting/diff toolbar; callers are
 * deliberately unchanged until complete widget parity and Native acceptance. */
export function NativeChatSurface({ widgets, plugins, onReady, ...props }: NativePageEditorProps) {
  const handleFileUpload = useFileUpload();
  const handleImageUpload = useImageUpload();
  const fileOwner = useNativeFileOwner(handleFileUpload, { file: 'native-editor-file' });
  const imageOwner = createNativeImageOwner(handleImageUpload);
  const liveFileOwner = useRef(fileOwner);
  liveFileOwner.current = fileOwner;
  const liveImageOwner = useRef(imageOwner);
  liveImageOwner.current = imageOwner;
  const liveWidgets = useRef(widgets);
  liveWidgets.current = widgets;
  const ready = useRef(onReady);
  ready.current = onReady;
  const [editor] = useState(() =>
    createNativeBrowserEditor(
      () => liveWidgets.current,
      () => liveFileOwner.current,
      () => liveImageOwner.current,
      plugins,
    ),
  );
  const [lifetime] = useState(() => ({ generation: 0 }));
  useEffect(() => {
    const generation = ++lifetime.generation;
    return () => {
      // React StrictMode immediately replays effects. Preserve that real editor
      // lifetime, but dispose after the final unmount and pending draft flush.
      queueMicrotask(() => {
        if (lifetime.generation === generation) editor.destroy();
      });
    };
  }, [editor, lifetime]);
  return (
    <NativeEditorSurface
      {...props}
      editor={editor}
      onInit={(kernel) => ready.current(kernel, nativeEditorRuntimeCommands)}
    >
      {props.children}
    </NativeEditorSurface>
  );
}
export type { NativeEditorWidgets, NativeWidgetProps } from '@/components/NativePageEditor/session';
