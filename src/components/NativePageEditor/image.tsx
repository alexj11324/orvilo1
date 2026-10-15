'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Image } from '@/components/ImagePreview';
import { ImageViewer } from '@/components/ImagePreview/viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { openFileDownload } from '@/features/EditorCanvas/fileDownload';
import { needsImageRehost, rehostImage } from '@/features/EditorCanvas/rehostImage';
import type { EditorAttachmentUpload } from '@/features/EditorCanvas/useImageUpload';
import { getHostPort } from '@/platform';

import { nativeImageWidth, resizedImageWidth, type ResizeDrag } from './imageGeometry';

export interface NativeImageNode extends LexicalNode {
  readonly altText: string;
  readonly height: number | string;
  readonly maxWidth: number;
  readonly message: string | null;
  setError: (message: string) => void;
  setMaxWidth: (width: number) => void;
  setStatus: (status: 'uploaded' | 'loading' | 'error') => void;
  setUploaded: (url: string) => void;
  setWidth: (width: number) => void;
  readonly src: string;
  readonly status: 'uploaded' | 'loading' | 'error';
  readonly width: number | string;
}
export function isNativeImage(node: LexicalNode | null): node is NativeImageNode {
  return (
    !!node &&
    (node.getType() === 'image' || node.getType() === 'block-image') &&
    'setUploaded' in node &&
    'setWidth' in node
  );
}

/** Use the application's real attachment adapter; no simulated upload or SDK UI. */
export function createNativeImageOwner(handleUpload: EditorAttachmentUpload) {
  return {
    defaultBlockImage: true,
    getImageWidth: nativeImageWidth,
    handleUpload,
    handleRehost: rehostImage,
    needRehost: needsImageRehost,
    render(node: LexicalNode, kernel: NativeIEditorKernel) {
      if (!isNativeImage(node)) throw new Error('Native image owner received a non-image node');
      const editor = kernel.getLexicalEditor();
      if (!editor) throw new Error('Native image editor is unavailable');
      return <NativeImage editor={editor} handleUpload={handleUpload} nodeKey={node.getKey()} />;
    },
  };
}
export type NativeImageOwner = ReturnType<typeof createNativeImageOwner>;

function NativeImage({
  editor,
  handleUpload,
  nodeKey,
}: {
  editor: LexicalEditor;
  handleUpload: EditorAttachmentUpload;
  nodeKey: string;
}) {
  const { t } = useTranslation(['editor', 'common']);
  const [revision, setRevision] = useState(0);
  const [editable, setEditable] = useState(editor.isEditable());
  const [draftUrl, setDraftUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [width, setWidth] = useState<number>();
  const [preview, setPreview] = useState<HTMLElement>();
  const [loadedImage, setLoadedImage] = useState<{ source: string; element: HTMLImageElement }>();
  const loadedSource = loadedImage?.source;
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const naturalWidth = useRef(0);
  const drag = useRef<ResizeDrag | null>(null);
  const [operation] = useState(() => ({ generation: 0 }));
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const update = editor.registerUpdateListener(() => setRevision((value) => value + 1));
    const editableChange = editor.registerEditableListener((value) => {
      setEditable(value);
      if (!value) {
        drag.current = null;
        setWidth(undefined);
        setEditing(false);
      }
    });
    return () => {
      alive.current = false;
      operation.generation++;
      update();
      editableChange();
    };
  }, [editor, operation]);
  // Read the actual current immutable Lexical node, including undo/redo and remote updates.
  const state = editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!isNativeImage(node)) return null;
    return {
      src: node.src,
      alt: node.altText,
      width: node.width,
      height: node.height,
      maxWidth: node.maxWidth,
      status: node.status,
      selected: node.isSelected(),
    };
  });
  useEffect(() => {
    drag.current = null;
    setWidth(undefined);
    setPreview(undefined);
  }, [state?.src]);
  void revision;
  const mutate = (change: (node: NativeImageNode) => void, requireEditable = true) => {
    if (requireEditable && !editor.isEditable()) return false;
    editor.update(
      () => {
        const current = $getNodeByKey(nodeKey);
        if (isNativeImage(current) && current.isAttached()) change(current);
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    return true;
  };
  if (!state) return null;
  const select = (additive = false) => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      let selection = $getSelection();
      if (!$isNodeSelection(selection) || !additive) {
        selection = $createNodeSelection();
        $setSelection(selection);
      }
      if ($isNodeSelection(selection)) selection.add(nodeKey);
    });
  };
  const replace = async (file: File) => {
    if (!alive.current || !editor.isEditable() || busy) return;
    const request = ++operation.generation;
    setBusy(true);
    setError(undefined);
    const originalSource = state.src;
    try {
      const result = await handleUpload(file);
      if (request === operation.generation && alive.current)
        mutate((node) => {
          if (node.src === originalSource) node.setUploaded(result.url);
        }, false);
    } catch {
      if (request === operation.generation && alive.current) {
        // Retain the original URL and visible controls for retry; never discard the old image.
        setError(t('nativeImage.uploadFailed'));
      }
    } finally {
      if (request === operation.generation && alive.current) setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const pick = async () => {
    if (!alive.current || !editor.isEditable() || busy) return;
    try {
      const result = await getHostPort().dialog.pickAttachments({
        accept: 'image/*',
        multiple: false,
      });
      if (!Array.isArray(result)) throw new Error('Attachment picker is unavailable');
      const file = result[0];
      if (!alive.current || !file || !editor.isEditable()) return;
      await replace(file);
    } catch {
      if (alive.current) setError(t('nativeImage.pickFailed'));
    }
  };
  const commitWidth = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    mutate((node) => {
      node.setWidth(value);
      node.setMaxWidth(value);
    });
    setWidth(undefined);
  };
  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!alive.current || !editor.isEditable() || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const initialWidth = wrapper.current?.getBoundingClientRect().width;
    if (!initialWidth) return;
    const bounds = wrapper.current?.getBoundingClientRect();
    const physicalSide =
      bounds && event.currentTarget.getBoundingClientRect().left > bounds.left + bounds.width / 2
        ? 1
        : -1;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: initialWidth,
      side: physicalSide,
      maxWidth: wrapper.current?.parentElement?.clientWidth || initialWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizeHandle = (side: -1 | 1) => (
    <button
      aria-label={t('nativeImage.resize')}
      className={`absolute inset-y-0 flex w-6 cursor-ew-resize items-center justify-center touch-none bg-transparent focus-visible:outline-2 focus-visible:outline-ring ${side === -1 ? 'inset-s-0' : 'inset-e-0'}`}
      contentEditable={false}
      type="button"
      onPointerDown={(event) => startResize(event)}
      onKeyDown={(event) => {
        if (!editor.isEditable()) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          const initial = wrapper.current?.getBoundingClientRect().width || naturalWidth.current;
          const max = wrapper.current?.parentElement?.clientWidth || initial;
          commitWidth(resizedImageWidth(initial, event.key === 'ArrowLeft' ? -1 : 1, max));
        }
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setWidth(undefined);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setWidth(undefined);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.pointerId === event.pointerId && editor.isEditable())
          setWidth(
            resizedImageWidth(
              current.startWidth,
              (event.clientX - current.startX) * current.side * 2,
              current.maxWidth,
            ),
          );
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        drag.current = null;
        if (current?.pointerId === event.pointerId && editor.isEditable())
          commitWidth(
            resizedImageWidth(
              current.startWidth,
              (event.clientX - current.startX) * current.side * 2,
              current.maxWidth,
            ),
          );
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <span className="h-6 w-1 rounded-full bg-primary" />
    </button>
  );
  return (
    <div className="flex max-w-full flex-col gap-2" contentEditable={false}>
      <div
        className="relative max-w-full rounded-(--radius-card) data-[selected=true]:outline-2 data-[selected=true]:outline-primary"
        data-selected={state.selected}
        ref={wrapper}
        style={{
          width: width ?? (typeof state.width === 'number' ? state.width : undefined),
          maxWidth: state.maxWidth || undefined,
        }}
        onClick={(event) => {
          event.stopPropagation();
          select(event.ctrlKey || event.metaKey || event.shiftKey);
        }}
        onDoubleClick={(event) => {
          if (editor.isEditable() && loadedSource === state.src && naturalWidth.current) {
            event.preventDefault();
            commitWidth(naturalWidth.current);
          }
        }}
      >
        <Image
          alt={state.alt}
          className="w-full"
          draggable={false}
          height={typeof state.height === 'number' ? state.height : undefined}
          objectFit="contain"
          preview={false}
          src={state.src}
          width="100%"
          onLoad={(event) => {
            naturalWidth.current = event.currentTarget.naturalWidth;
            setLoadedImage({ source: state.src, element: event.currentTarget });
          }}
        />
        {(busy || state.status === 'loading') && (
          <div
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center bg-fill-quaternary"
            role="status"
          >
            <Spinner aria-label={t('loading', { ns: 'common' })} />
          </div>
        )}
        {editable && loadedSource === state.src && !busy && state.status !== 'loading' && (
          <>
            {resizeHandle(-1)}
            {resizeHandle(1)}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={loadedSource !== state.src || !state.src || state.status === 'loading'}
          size="compact"
          variant="ghost"
          onClick={(event) => setPreview(event.currentTarget)}
        >
          {t('nativeImage.preview')}
        </Button>
        {editable && (
          <Button
            disabled={busy}
            size="compact"
            variant="ghost"
            onClick={() => {
              setDraftUrl(state.src);
              setEditing(!editing);
            }}
          >
            {t('nativeImage.edit')}
          </Button>
        )}
        {editable && (
          <Button disabled={busy} size="compact" variant="ghost" onClick={() => void pick()}>
            {t('nativeImage.replace')}
          </Button>
        )}
        {editable && (
          <Button
            disabled={busy}
            size="compact"
            variant="ghost"
            onClick={() => mutate((node) => node.remove())}
          >
            {t('nativeImage.remove')}
          </Button>
        )}
      </div>
      {(error || state.status === 'error') && (
        <p className="text-sm text-destructive-text" role="alert">
          {error || t('nativeImage.uploadFailed')}
        </p>
      )}
      {editing && editable && (
        <form
          className="flex flex-wrap items-center gap-2"
          onKeyDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            if (!editor.isEditable()) return;
            const url = draftUrl.trim();
            try {
              const parsed = new URL(url, window.location.href);
              if (['javascript:', 'vbscript:'].includes(parsed.protocol))
                throw new Error('Invalid image protocol');
            } catch {
              setError(t('nativeImage.invalidUrl'));
              return;
            }
            if (mutate((node) => node.setUploaded(url))) {
              setEditing(false);
              setError(undefined);
            }
          }}
        >
          <Input
            aria-label={t('nativeImage.url')}
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setEditing(false);
              }
            }}
          />
          <Button disabled={busy || !draftUrl.trim()} size="compact" type="submit">
            {t('confirm')}
          </Button>
          <Button size="compact" type="button" variant="ghost" onClick={() => setEditing(false)}>
            {t('cancel')}
          </Button>
        </form>
      )}
      <input
        accept="image/*"
        className="hidden"
        disabled={!editable || busy}
        ref={input}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void replace(file);
        }}
      />
      {preview && loadedImage && loadedImage.source === state.src && (
        <ImageViewer
          initialIndex={0}
          opener={preview}
          entries={[
            {
              element: loadedImage.element,
              id: nodeKey,
              source: state.src,
              options: { onDownload: openFileDownload },
            },
          ]}
          onClose={() => setPreview(undefined)}
        />
      )}
    </div>
  );
}
