'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { isHostUnsupportedResult } from '@orvilo/types';
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { useDocumentTransferMenuItem } from '@/business/client/hooks/useDocumentTransferMenuItem';
import { confirmModal } from '@/components/Modal';
import type { ComposerTarget } from '@/features/Conversation/types';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import VisibilityConfirmContent from '@/features/VisibilityConfirmContent';
import { useIsLargeViewport } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { getHostPort } from '@/platform';
import { useDocumentStore } from '@/store/document';
import { useFileStore } from '@/store/file';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { usePageStore } from '@/store/page';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { PageAgentProvider } from '../PageAgentProvider';
import { usePageDocumentMetadata } from '../usePageDocumentMetadata';
import {
  NativeCollaborativePageDocumentHost,
  type NativeCollaborativePageDocumentHostProps,
} from './NativeCollaborativePageDocumentHost';
import { completeNativePageCreation, saveNativePageBeforeLeave } from './nativePageActions';
import { useNativePageMetadata } from './useNativePageMetadata';

export interface NativePageEditorPublicProps {
  askCopilotTarget?: ComposerTarget;
  emoji?: string;
  fullWidthHeader?: boolean;
  header?: ReactNode | null;
  knowledgeBaseId?: string;
  metaReadOnly?: boolean;
  /** Actual custom header implemented against NativePageChromeContext. */
  nativeHeader?: ReactNode | null;
  onBack?: () => void;
  onDelete?: () => void;
  onDocumentIdChange?: (newId: string) => void;
  onEmojiChange?: (emoji: string | undefined) => void;
  onSave?: () => void;
  onTitleChange?: (title: string) => void;
  pageId?: string;
  /** Provider already carried parentId; expose it without losing folder scope. */
  parentId?: string;
  rightPanel?: boolean;
  syncPageAgentActiveState?: boolean;
  title?: string;
}
export interface NativePageChromeState {
  askCopilotTarget?: ComposerTarget;
  authorName?: string | null;
  back: () => Promise<void>;
  canCreate: boolean;
  canDelete: boolean;
  canGoBack: boolean;
  canMakePrivate: boolean;
  canPublish: boolean;
  canToggleWideScreen: boolean;
  copyLink: () => Promise<void>;
  documentId: string;
  duplicate: () => Promise<void>;
  editable: boolean;
  editor?: NativeIEditorKernel;
  emoji?: string;
  exportMarkdown: () => Promise<void>;
  isInLibrary: boolean;
  knowledgeBaseId?: string;
  lastUpdatedTime?: string | null;
  makePrivate: () => Promise<void>;
  metadata: ReturnType<typeof useNativePageMetadata>;
  metaEditable: boolean;
  page: ReturnType<typeof usePageDocumentMetadata>;
  parentId?: string;
  publish: () => Promise<void>;
  remove: () => void;
  rightPanelMode: 'copilot' | 'history';
  save: () => Promise<void>;
  setRightPanelMode: (mode: 'copilot' | 'history') => void;
  submitTitle: () => Promise<void>;
  title: string;
  toggleWideScreen: () => void;
  transferMenuItems: ReturnType<typeof useDocumentTransferMenuItem>;
  wideScreen: boolean;
}
const NativePageChromeContext = createContext<NativePageChromeState | null>(null);
export function useNativePageChrome(): NativePageChromeState {
  const value = use(NativePageChromeContext);
  if (!value) throw new Error('Native page chrome must render inside its assembler');
  return value;
}
/** Required render seams preserve complex chrome instead of silently dropping
 * the SDK-store-dependent history/copilot/header/comment surfaces. Implementors
 * receive native state/actions; they must not cast a native kernel to IEditor. */
export interface NativePageChrome {
  bodyTools: (state: NativePageChromeState) => ReactNode;
  comments: (state: NativePageChromeState) => ReactNode;
  create: (state: {
    title: string;
    emoji?: string;
    canCreate: boolean;
    pending: boolean;
    error?: unknown;
    setTitle: (title: string) => void;
    setEmoji: (emoji: string | undefined) => void;
    create: () => Promise<void>;
  }) => ReactNode;
  header: (state: NativePageChromeState) => ReactNode;
  likes: (state: NativePageChromeState) => ReactNode;
  rightPanel: (state: NativePageChromeState) => ReactNode;
  titleAndEmoji: (state: NativePageChromeState) => ReactNode;
}
export interface NativePageEditorAssemblerProps extends NativePageEditorPublicProps {
  chrome: NativePageChrome;
  /** Private layout adapter for full/native assembly; public page props stay unchanged. */
  contentLayout?: (content: ReactNode, state: NativePageChromeState) => ReactNode;
  /** All existing widgets/media owners/runtime remain mandatory. */
  document: Omit<
    NativeCollaborativePageDocumentHostProps,
    | 'documentId'
    | 'getTitle'
    | 'setTitle'
    | 'header'
    | 'footer'
    | 'onSave'
    | 'onInit'
    | 'children'
    | 'metadataDirty'
    | 'beforeSave'
  >;
}
export function NativePageEditorAssembler(props: NativePageEditorAssemblerProps) {
  const [createdId, setCreatedId] = useState<string>();
  const id = props.pageId ?? createdId;
  if (!id) return <NativeCreatePage {...props} onCreated={setCreatedId} />;
  return (
    <PageAgentProvider pageId={id} syncActiveAgent={props.syncPageAgentActiveState}>
      <NativeAssembledSession key={id} {...props} documentId={id} />
    </PageAgentProvider>
  );
}
function NativeCreatePage({
  onCreated,
  ...props
}: NativePageEditorAssemblerProps & { onCreated: (id: string) => void }) {
  const { allowed: canCreate } = usePermission('create_content');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [draftTitle, setDraftTitle] = useState(props.title ?? '');
  const [draftEmoji, setDraftEmoji] = useState(props.emoji);
  const inFlight = useRef(false);
  const created = useRef<string | undefined>(undefined);
  return props.chrome.create({
    title: draftTitle,
    emoji: draftEmoji,
    canCreate,
    pending,
    error,
    setTitle: setDraftTitle,
    setEmoji: setDraftEmoji,
    create: async () => {
      if (!canCreate || inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setError(undefined);
      try {
        const { documentService } = await import('@/services/document');
        const id = await completeNativePageCreation({
          existingId: created.current,
          title: draftTitle,
          emoji: draftEmoji,
          create: () =>
            usePageStore.getState().createPage({
              title: draftTitle,
              content: '',
              knowledgeBaseId: props.knowledgeBaseId,
              parentId: props.parentId,
            }),
          retainId: (id) => {
            created.current = id;
          },
          update: (value) => documentService.updateDocument(value),
        });
        onCreated(id);
        props.onDocumentIdChange?.(id);
        props.onTitleChange?.(draftTitle);
        if (draftEmoji !== props.emoji) props.onEmojiChange?.(draftEmoji);
      } catch (nextError) {
        setError(nextError);
        throw nextError;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
  });
}
function NativeAssembledSession(props: NativePageEditorAssemblerProps & { documentId: string }) {
  const { t } = useTranslation(['file', 'common']);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const { allowed: canCreate } = usePermission('create_content');
  const page = usePageDocumentMetadata(props.documentId);
  const workspaceId = useActiveWorkspaceId();
  const authorName = useAuthorInfo(page?.userId)?.fullName;
  const lastUpdatedTime = useDocumentStore((s) =>
    s.documents[props.documentId]?.lastUpdatedTime?.toISOString(),
  );
  const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);
  const toggleWideScreen = useGlobalStore((s) => s.toggleWideScreen);
  const canToggleWideScreen = useIsLargeViewport();
  const userId = useUserStore(userProfileSelectors.userId);
  const [editor, setEditor] = useState<NativeIEditorKernel>();
  const [editable, setEditable] = useState(false);
  const [rightPanelMode, setMode] = useState<'copilot' | 'history'>('copilot');
  useEffect(() => {
    const lexical = editor?.getLexicalEditor();
    setEditable(lexical?.isEditable() ?? false);
    return lexical?.registerEditableListener(setEditable);
  }, [editor]);
  const metadata = useNativePageMetadata({
    documentId: props.documentId,
    title: props.title ?? page?.title ?? '',
    emoji:
      props.emoji ?? (typeof page?.metadata?.emoji === 'string' ? page.metadata.emoji : undefined),
    editable: canEdit && editable,
    metaReadOnly: props.metaReadOnly,
    onTitleChange: props.onTitleChange,
    onEmojiChange: props.onEmojiChange,
  });
  const { canManageResource } = useResourceAccess(
    'document',
    page?.workspaceId ? props.documentId : undefined,
  );
  const canDelete = !!page && canEdit && canManageResource;
  const ownPage = !!userId && page?.userId === userId;
  const isInLibrary = !!(props.knowledgeBaseId || page?.metadata?.knowledgeBaseId);
  const canPublish = !!(workspaceId && ownPage && canEdit && page?.visibility === 'private');
  const canMakePrivate = !!(workspaceId && ownPage && canEdit && page?.visibility === 'public');
  const transferMenuItems = useDocumentTransferMenuItem(props.documentId, {
    defaultTargetVisibility: page?.visibility === 'public' ? 'public' : 'private',
    preferCurrentWorkspace: !!(workspaceId && ownPage && canEdit),
    transferLabel: t('pageEditor.menu.move'),
  });
  const assertClean = async () => {
    if (!editor) {
      await metadata.flush();
      return;
    }
    await saveNativePageBeforeLeave({
      documentId: props.documentId,
      editor,
      flushMetadata: metadata.flush,
      getState: useDocumentStore.getState,
      failedMessage: t('pageEditor.saveFailed'),
    });
  };
  const controls: NativePageChromeState = {
    documentId: props.documentId,
    title: metadata.title,
    emoji: metadata.emoji,
    parentId: props.parentId ?? page?.parentId ?? undefined,
    knowledgeBaseId: props.knowledgeBaseId,
    askCopilotTarget: props.askCopilotTarget,
    authorName,
    lastUpdatedTime:
      lastUpdatedTime ?? (page?.updatedAt ? new Date(page.updatedAt).toISOString() : null),
    wideScreen,
    canToggleWideScreen,
    toggleWideScreen,
    editor,
    editable: canEdit && editable,
    metaEditable: canEdit && editable && !props.metaReadOnly,
    canCreate,
    canGoBack: !!props.onBack,
    canDelete,
    canPublish,
    canMakePrivate,
    isInLibrary,
    page,
    metadata,
    transferMenuItems,
    rightPanelMode,
    setRightPanelMode: (mode) => {
      if (mode === 'history' || canEdit) setMode(mode);
    },
    save: async () => {
      await assertClean();
      props.onSave?.();
    },
    back: async () => {
      await assertClean();
      props.onBack?.();
    },
    submitTitle: async () => {
      await metadata.flush();
      editor?.focus();
    },
    remove: () => {
      if (!canDelete) return;
      confirmModal({
        title: t('pageEditor.deleteConfirm.title'),
        content: t('pageEditor.deleteConfirm.content'),
        okText: t('delete', { ns: 'common' }),
        cancelText: t('cancel', { ns: 'common' }),
        okButtonProps: { danger: true },
        onOk: async () => {
          await useFileStore.getState().removeDocument(props.documentId);
          await usePageStore.getState().deletePage(props.documentId);
          props.onDelete?.();
        },
      });
    },
    duplicate: async () => {
      if (canCreate) await useFileStore.getState().duplicateDocument(props.documentId);
    },
    publish: async () => {
      if (!canPublish) return;
      confirmModal({
        title: t('pageList.publishConfirm.title'),
        content: <VisibilityConfirmContent variant="publish" />,
        okText: t('continue', { ns: 'common' }),
        cancelText: t('cancel', { ns: 'common' }),
        onOk: async () => {
          await usePageStore.getState().publishPageToWorkspace(props.documentId);
        },
      });
    },
    makePrivate: async () => {
      if (!canMakePrivate) return;
      confirmModal({
        title: t('makePrivate.confirm.title', { ns: 'common' }),
        content: <VisibilityConfirmContent inLibrary={isInLibrary} variant="makePrivate" />,
        okText: t('continue', { ns: 'common' }),
        cancelText: t('cancel', { ns: 'common' }),
        okButtonProps: { danger: true },
        onOk: async () => {
          await usePageStore.getState().setPageVisibility(props.documentId, 'private');
        },
      });
    },
    copyLink: async () => {
      const link = await getHostPort().document.resolveLink(window.location.pathname);
      if (isHostUnsupportedResult(link)) throw new Error('Public document links unavailable');
      await navigator.clipboard.writeText(link);
    },
    exportMarkdown: async () => {
      const markdown = editor?.getDocument('markdown');
      if (typeof markdown !== 'string') throw new Error('Markdown export unavailable');
      const fileName = `${metadata.title || 'Untitled'}.md`;
      const result = await getHostPort().document.exportMarkdown({ content: markdown, fileName });
      if (isHostUnsupportedResult(result)) throw new Error('Markdown export unavailable');
    },
  };
  const documentContent = (
    <>
      {props.chrome.titleAndEmoji(controls)}
      <NativeCollaborativePageDocumentHost
        {...props.document}
        beforeSave={metadata.flush}
        documentId={props.documentId}
        getTitle={() => metadata.title}
        metadataDirty={metadata.dirty}
        setTitle={metadata.setTitle}
        footer={
          <>
            {props.chrome.likes(controls)}
            {props.chrome.comments(controls)}
          </>
        }
        onInit={setEditor}
        onSave={props.onSave}
      >
        {props.chrome.bodyTools(controls)}
      </NativeCollaborativePageDocumentHost>
    </>
  );
  const header = props.header === undefined ? props.chrome.header(controls) : props.header;
  const panel =
    props.rightPanel === false || (!canEdit && rightPanelMode === 'copilot')
      ? null
      : props.chrome.rightPanel(controls);
  return (
    <NativePageChromeContext value={controls}>
      <div className="flex size-full min-h-0 flex-col bg-card">
        {props.fullWidthHeader && header}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!props.fullWidthHeader && header}
            <div className="min-h-0 flex-1 overflow-auto">
              {props.contentLayout
                ? props.contentLayout(documentContent, controls)
                : documentContent}
            </div>
          </div>
          {panel}
        </div>
      </div>
    </NativePageChromeContext>
  );
}
