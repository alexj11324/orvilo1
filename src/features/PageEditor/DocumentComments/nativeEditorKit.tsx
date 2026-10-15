'use client';

import {
  INSERT_FILE_COMMAND,
  INSERT_IMAGE_COMMAND,
  type NativeIEditorKernel,
} from '@orvilo/editor-runtime/native-browser';
import { type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useNativeFileOwner } from '@/components/NativePageEditor/file';
import { createNativeImageOwner } from '@/components/NativePageEditor/image';
import { NativeLinkEditor } from '@/components/NativePageEditor/linkEditor';
import { NativeMentionMenu } from '@/components/NativePageEditor/mentions';
import { NativeRichToolbar } from '@/components/NativePageEditor/richToolbar';
import {
  createNativeBrowserEditor,
  type NativeEditorWidgets,
} from '@/components/NativePageEditor/session';
import { NativeEditorSurface } from '@/components/NativePageEditor/surface';
import { useNativeWorkspaceMentions } from '@/components/NativePageEditor/useWorkspaceMentions';
import { mentionFilledClassName } from '@/features/ChatInput/InputEditor/mentionStyle';
import { nativeChatEmbedPlugins } from '@/features/ChatInput/native/embedPlugins';
import { registerAttachment } from '@/features/EditorCanvas/attachmentRegistry';
import { existingAttachmentByFile } from '@/features/EditorCanvas/editorAttachmentTransfer';
import { registerAttachmentClickOpen } from '@/features/EditorCanvas/registerAttachmentClickOpen';
import { registerBlockDecoratorCaretGuardOnLexical } from '@/features/EditorCanvas/registerBlockDecoratorCaretGuard';
import { useFileUpload, useImageUpload } from '@/features/EditorCanvas/useImageUpload';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import {
  type CommentEditorHandle,
  type CommentEditorViewProps,
  type DocumentCommentEditorKit,
  DocumentCommentEditorKitProvider,
} from './editorKit';
import { NativeCommentOwnersContext } from './nativeCommentOwners';
import { readNativeCommentValue } from './nativeCommentValue';
import { NativePublishedCommentContent } from './NativePublishedCommentContent';
import {
  COMMENT_CONTENT_IMAGE_MAX_HEIGHT,
  COMMENT_EDITOR_IMAGE_MAX_HEIGHT,
  styles,
} from './styles';

const nativeKit: DocumentCommentEditorKit = {
  PublishedContent: NativePublishedCommentContent,
  Input: ({
    children,
    className,
    footer,
    header,
    slashMenuRef,
    onBodyClick,
    flex,
    minHeight,
    maxHeight,
  }) => (
    <div
      className={cn('min-w-0 rounded-(--radius-input) border border-input bg-card', className)}
      ref={slashMenuRef}
      style={{ flex, minHeight, maxHeight }}
    >
      {header}
      <div
        className="min-w-0"
        onClick={(event) => {
          if (event.target === event.currentTarget) onBodyClick?.();
        }}
      >
        {children}
      </div>
      {footer}
    </div>
  ),
  ActionBar: ({ left, right, style }) => (
    <div className="flex flex-wrap items-center justify-between gap-2" style={style}>
      <div className="flex min-w-0 items-center">{left}</div>
      <div className="flex items-center">{right}</div>
    </div>
  ),
  useEditor: useNativeCommentEditor,
};
/** Required full widgets are the SAME native rich owners as the document.
 * No blank math/code/embed fallback or old SDK Provider is permitted. */
export function NativeDocumentCommentEditorProvider({
  widgets,
  children,
}: {
  widgets: NativeEditorWidgets;
  children: ReactNode;
}) {
  const { t } = useTranslation('editor');
  const handleFileUpload = useFileUpload();
  const handleImageUpload = useImageUpload();
  const fileOwner = useNativeFileOwner(handleFileUpload, { file: 'native-editor-file' });
  const imageOwner = useMemo(
    () =>
      createNativeImageOwner(handleImageUpload, {
        maxUnresizedHeight: COMMENT_EDITOR_IMAGE_MAX_HEIGHT,
      }),
    [handleImageUpload],
  );
  const publishedImageOwner = useMemo(
    () =>
      createNativeImageOwner(handleImageUpload, {
        maxUnresizedHeight: COMMENT_CONTENT_IMAGE_MAX_HEIGHT,
      }),
    [handleImageUpload],
  );
  const plugins = useMemo(() => nativeChatEmbedPlugins(t), [t]);
  const owners = useMemo(
    () => ({ widgets, fileOwner, imageOwner, publishedImageOwner, plugins }),
    [widgets, fileOwner, imageOwner, publishedImageOwner, plugins],
  );
  return (
    <NativeCommentOwnersContext value={owners}>
      <DocumentCommentEditorKitProvider kit={nativeKit}>
        {children}
      </DocumentCommentEditorKitProvider>
    </NativeCommentOwnersContext>
  );
}
function useNativeCommentEditor(): CommentEditorHandle {
  const owners = use(NativeCommentOwnersContext);
  if (!owners) throw new Error('Native comment rich widget owners are required');
  const live = useRef(owners);
  live.current = owners;
  // Cards which are merely displayed do not allocate a second edit kernel.
  const [holder] = useState<{ kernel?: NativeIEditorKernel }>(() => ({}));
  const getKernel = useCallback(
    () =>
      (holder.kernel ??= createNativeBrowserEditor(
        () => live.current.widgets,
        () => live.current.fileOwner,
        () => live.current.imageOwner,
        live.current.plugins,
      )),
    [holder],
  );
  const [lifetime] = useState(() => ({ generation: 0 }));
  useEffect(() => {
    const generation = ++lifetime.generation;
    return () => {
      queueMicrotask(() => {
        if (lifetime.generation === generation) holder.kernel?.destroy();
      });
    };
  }, [holder, lifetime]);
  return useMemo<CommentEditorHandle>(
    () => ({
      cleanDocument: () => getKernel().cleanDocument(),
      focus: () => {
        const kernel = getKernel();
        if (kernel.getLexicalEditor()) kernel.focus();
      },
      getValue: () => readNativeCommentValue(getKernel()),
      setValue: (value) => {
        const kernel = getKernel();
        if (value.editorData)
          kernel.setDocument('json', JSON.stringify(value.editorData), { keepId: true });
        else kernel.setDocument('markdown', value.content);
      },
      insertFiles: (files) => {
        const kernel = getKernel();
        if (!kernel.getLexicalEditor()?.isEditable()) return;
        for (const file of files)
          kernel.dispatchCommand(
            file.type.startsWith('image/') ? INSERT_IMAGE_COMMAND : INSERT_FILE_COMMAND,
            { file },
          );
        kernel.focus();
      },
      insertExisting: (attachments) => {
        const kernel = getKernel();
        if (!kernel.getLexicalEditor()?.isEditable()) return;
        for (const attachment of attachments) {
          const file = new File([], attachment.name, { type: attachment.fileType });
          Object.defineProperty(file, 'size', { value: attachment.size });
          existingAttachmentByFile.set(file, attachment);
          registerAttachment(attachment.url, attachment.fileId);
          kernel.dispatchCommand(INSERT_FILE_COMMAND, { file });
        }
        kernel.focus();
      },
      renderEditor: (props) => <NativeCommentSurface {...props} kernel={getKernel()} />,
      renderFormattingToolbar: () => <NativeRichToolbar editor={getKernel()} />,
    }),
    [getKernel],
  );
}
function NativeCommentSurface({
  kernel,
  autoFocus,
  compact,
  disabled,
  entityId,
  getPopupContainer,
  initialContent,
  initialEditorData,
  onChange,
  onPressEnter,
  placeholder,
}: CommentEditorViewProps & { kernel: NativeIEditorKernel }) {
  const workspaceId = useActiveWorkspaceId();
  const mentionOptions = useNativeWorkspaceMentions(!!workspaceId);
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const [initialized, setInitialized] = useState(false);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!initialized) return;
    const lexical = kernel.getLexicalEditor();
    if (!lexical) return;
    const detachCaret = registerBlockDecoratorCaretGuardOnLexical(lexical);
    const detachAttachments = registerAttachmentClickOpen(kernel);
    return () => {
      detachCaret();
      detachAttachments?.();
    };
  }, [initialized, kernel]);
  useEffect(() => {
    if (!root) return;
    let release: (() => void) | undefined;
    const start = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const handle = event.target.closest('button');
      if (
        !handle ||
        getComputedStyle(handle).cursor !== 'ew-resize' ||
        !handle.parentElement?.querySelector('img')
      )
        return;
      release?.();
      const previousHeight = root.style.height;
      const previousOverflow = root.style.overflow;
      root.style.height = `${root.getBoundingClientRect().height}px`;
      root.style.overflow = 'hidden';
      release = () => {
        root.style.height = previousHeight;
        root.style.overflow = previousOverflow;
        release = undefined;
      };
    };
    const finish = () => release?.();
    root.addEventListener('pointerdown', start, true);
    root.addEventListener('lostpointercapture', finish, true);
    const doc = root.ownerDocument;
    doc.addEventListener('pointerup', finish, true);
    doc.addEventListener('pointercancel', finish, true);
    return () => {
      root.removeEventListener('pointerdown', start, true);
      root.removeEventListener('lostpointercapture', finish, true);
      doc.removeEventListener('pointerup', finish, true);
      doc.removeEventListener('pointercancel', finish, true);
      finish();
    };
  }, [root]);
  return (
    <div
      className={cn(styles.commentEditor, mentionFilledClassName, 'pt-1.5 pb-2.5')}
      data-motion-disabled={animationMode === 'disabled' || undefined}
      data-native-comment-editor={entityId}
      ref={setRoot}
    >
      <NativeEditorSurface
        autoFocus={autoFocus}
        content={initialEditorData ?? initialContent}
        contentClassName={compact ? 'min-h-6' : 'min-h-11'}
        debounceWait={0}
        editable={!disabled}
        editor={kernel}
        label={placeholder}
        placeholder={placeholder}
        type={initialEditorData ? 'json' : initialContent ? 'markdown' : 'text'}
        onInit={() => setInitialized(true)}
        onTextChange={() => onChange?.(readNativeCommentValue(kernel))}
        onPressEnter={(event) =>
          event.isComposing || event.keyCode === 229 || kernel.getLexicalEditor()?.isComposing()
            ? false
            : onPressEnter?.(event)
        }
      />
      {initialized && (
        <>
          <NativeMentionMenu
            kernel={kernel}
            options={mentionOptions}
            getPopupContainer={(editorRoot) =>
              getPopupContainer?.() ?? editorRoot.ownerDocument.body
            }
          />
          <NativeLinkEditor kernel={kernel} />
        </>
      )}
    </div>
  );
}
