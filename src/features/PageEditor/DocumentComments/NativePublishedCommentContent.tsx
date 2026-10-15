'use client';

import { memo, use, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createNativeBrowserEditor } from '@/components/NativePageEditor/session';
import { NativeEditorSurface } from '@/components/NativePageEditor/surface';
import { registerAttachmentClickOpen } from '@/features/EditorCanvas/registerAttachmentClickOpen';

import type { CommentPublishedContentProps } from './editorKit';
import { NativeCommentOwnersContext } from './nativeCommentOwners';
import { styles } from './styles';

/** A persisted comment uses an isolated read-only native document. It never
 * registers the global page runtime/store or a workspace member search hook. */
export const NativePublishedCommentContent = memo(function NativePublishedCommentContent({
  content,
  editorData,
}: CommentPublishedContentProps) {
  const owners = use(NativeCommentOwnersContext);
  if (!owners) throw new Error('Published comments require actual native rich owners');
  const { t } = useTranslation('file');
  const live = useRef(owners);
  live.current = owners;
  const [kernel] = useState(() =>
    createNativeBrowserEditor(
      () => live.current.widgets,
      () => live.current.fileOwner,
      () => live.current.publishedImageOwner,
      live.current.plugins,
    ),
  );
  const document = useMemo(() => {
    const hasJson =
      editorData &&
      typeof editorData === 'object' &&
      !Array.isArray(editorData) &&
      Object.keys(editorData).length > 0;
    return hasJson
      ? { type: 'json' as const, value: JSON.stringify(editorData) }
      : { type: 'markdown' as const, value: content };
  }, [content, editorData]);
  const hydrated = useRef(false);
  const lastDocument = useRef(document);
  const [lifetime] = useState(() => ({ generation: 0 }));
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    const generation = ++lifetime.generation;
    return () => {
      queueMicrotask(() => {
        if (lifetime.generation === generation) kernel.destroy();
      });
    };
  }, [kernel, lifetime]);
  useEffect(() => {
    if (!hydrated.current || lastDocument.current === document) return;
    lastDocument.current = document;
    // Server edit refreshes must replace the published readonly snapshot. This
    // never shares the editable draft kernel owned by the same CommentCard.
    kernel.setDocument(document.type, document.value, { keepId: document.type === 'json' });
  }, [document, kernel]);
  useEffect(() => {
    if (initialized) return registerAttachmentClickOpen(kernel);
  }, [initialized, kernel]);
  return (
    <div data-native-published-comment className={styles.commentContent}>
      <NativeEditorSurface
        readOnlyPresentation
        content={document.value}
        contentClassName="min-h-0 text-sm leading-5.5"
        editable={false}
        editor={kernel}
        label={t('pageEditor.comments.title')}
        type={document.type}
        onInit={() => {
          hydrated.current = true;
          lastDocument.current = document;
          setInitialized(true);
        }}
      />
    </div>
  );
});
