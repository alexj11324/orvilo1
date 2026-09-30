'use client';

import {
  Clock3Icon,
  Copy,
  ExternalLink,
  FileText,
  Hash,
  Maximize2,
  PencilLine,
  Star,
  Trash,
  Wand2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { confirmModal } from '@/components/Modal';
import { type ModalInstance } from '@/components/Modal';
import { openRenameModal } from '@/components/RenameModal';
import { toast } from '@/components/toast';
import { DOCUMENT_HISTORY_QUERY_LIST_LIMIT } from '@/const/documentHistory';
import { isDesktop } from '@/const/version';
import { useAgentContext } from '@/features/Conversation/useAgentContext';
import { confirmRemoveTopic } from '@/features/DeleteTopicConfirm';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { openDocumentCompareModal } from '@/features/PageEditor/History/CompareModal';
import { formatHistoryAbsoluteTime } from '@/features/PageEditor/History/formatHistoryDate';
import type {
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
} from '@/server/routers/lambda/_schema/documentHistory';
import { documentService } from '@/services/document';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { useDocumentStore } from '@/store/document';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { copyToClipboard } from '@/utils/clipboard';

import { buildChatMarkdownTranscript } from './copyChatAsMarkdown';

interface TopicInfoHeaderProps {
  authorName: string;
  title: string;
  updatedAtLabel?: string;
}

const TopicInfoHeader = ({ authorName, title, updatedAtLabel }: TopicInfoHeaderProps) => (
  <div className="flex items-center gap-3 py-2 px-3" style={{ minWidth: 240 }}>
    <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0, overflow: 'hidden' }}>
      <div className="truncate font-bold" style={{ lineHeight: 1.4 }}>
        {title}
      </div>
      <div className="truncate text-[12px] text-muted-foreground" style={{ lineHeight: 1.4 }}>
        {updatedAtLabel ? `${authorName} ${updatedAtLabel}` : authorName}
      </div>
    </div>
  </div>
);

export const useMenu = (): { menuHeader?: ReactNode; menuItems: () => SidebarMenuItemData[] } => {
  const { t } = useTranslation(['chat', 'topic', 'common', 'file']);

  const { pathname } = useLocation();

  const [wideScreen, toggleWideScreen] = useGlobalStore((s) => [
    systemStatusSelectors.wideScreen(s),
    s.toggleWideScreen,
  ]);
  const openTopicInNewWindow = useGlobalStore((s) => s.openTopicInNewWindow);

  const { agentId: activeAgentId, topicId: routeTopicId } = useAgentContext();
  const activeTopic = useChatStore((s) =>
    routeTopicId ? topicSelectors.getTopicById(routeTopicId)(s) : undefined,
  );
  const workingDirectory = useChatStore(topicSelectors.getTopicWorkingDirectory(routeTopicId));
  const [autoRenameTopicTitle, favoriteTopic, removeTopic, updateTopicTitle] = useChatStore((s) => [
    s.autoRenameTopicTitle,
    s.favoriteTopic,
    s.removeTopic,
    s.updateTopicTitle,
  ]);

  const { docId } = useParams<{ docId?: string }>();
  const compareInstanceRef = useRef<ModalInstance | null>(null);

  const saveSourceLabels = useMemo<Record<DocumentHistorySaveSource, string>>(
    () => ({
      autosave: t('pageEditor.history.saveSource.autosave', { ns: 'file' }),
      llm_call: t('pageEditor.history.saveSource.llm_call', { ns: 'file' }),
      manual: t('pageEditor.history.saveSource.manual', { ns: 'file' }),
      restore: t('pageEditor.history.saveSource.restore', { ns: 'file' }),
      system: t('pageEditor.history.saveSource.system', { ns: 'file' }),
    }),
    [t],
  );

  const handleRestoreHistory = useCallback(
    async (item: DocumentHistoryListItem, onSuccess?: () => void): Promise<void> => {
      if (!docId || item.isCurrent) return;

      const { editor, markDirty, performSave } = useDocumentStore.getState();
      if (!editor) {
        toast.error(t('pageEditor.history.restoreError', { ns: 'file' }));
        return;
      }

      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('pageEditor.history.restoreConfirm.content', {
          ns: 'file',
          savedAt: formatHistoryAbsoluteTime(item.savedAt),
        }),
        okText: t('pageEditor.history.restore', { ns: 'file' }),
        onOk: async () => {
          try {
            const result = await documentService.getDocumentHistoryItem(
              { documentId: docId, historyId: item.id },
              `header-actions-history-${docId}`,
            );

            editor.setDocument('json', JSON.stringify(result.editorData));
            markDirty(docId);
            await performSave(docId, undefined, {
              restoreFromHistoryId: item.id,
              saveSource: 'restore',
            });
            onSuccess?.();
          } catch (error) {
            console.error('[HeaderActions] Failed to restore history item:', error);
            toast.error(t('pageEditor.history.restoreError', { ns: 'file' }));
            throw error;
          }
        },
        title: t('pageEditor.history.restoreConfirm.title', { ns: 'file' }),
      });
    },
    [docId, t],
  );

  const openCompareModal = useCallback(async (): Promise<void> => {
    if (!docId) return;

    try {
      const result = await documentService.listDocumentHistory({
        documentId: docId,
        includeCurrent: true,
        limit: DOCUMENT_HISTORY_QUERY_LIST_LIMIT,
      });
      const items = result.items ?? [];

      if (items.length === 0) {
        toast.info(t('pageEditor.history.empty', { ns: 'file' }));
        return;
      }

      const initialHistoryId = items.find((item) => !item.isCurrent)?.id ?? items[0].id;

      compareInstanceRef.current?.destroy();
      const instance = openDocumentCompareModal({
        documentId: docId,
        initialHistoryId,
        items,
        onRestore: (item) => {
          void handleRestoreHistory(item, () => instance.close());
        },
        saveSourceLabels,
      });
      compareInstanceRef.current = instance;
    } catch (error) {
      console.error('[HeaderActions] Failed to open document compare modal:', error);
      toast.error(t('pageEditor.history.compareError', { ns: 'file' }));
    }
  }, [docId, handleRestoreHistory, saveSourceLabels, t]);

  const authorInfo = useAuthorInfo(activeTopic?.userId);

  const topicId = activeTopic?.id;
  const topicTitle = activeTopic?.title ?? '';
  const isFavorite = !!activeTopic?.favorite;
  const menuHeader = useMemo<ReactNode | undefined>(() => {
    if (!authorInfo?.fullName || !topicId) return undefined;

    const updatedAt = activeTopic?.updatedAt;
    const formattedDate = updatedAt
      ? new Date(updatedAt).toLocaleString(undefined, {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';
    const updatedAtLabel = formattedDate
      ? t('info.updatedAt', { ns: 'topic', time: formattedDate })
      : undefined;

    return (
      <TopicInfoHeader
        authorName={authorInfo.fullName}
        title={t('info.title', { ns: 'topic' })}
        updatedAtLabel={updatedAtLabel}
      />
    );
  }, [activeTopic?.updatedAt, authorInfo?.fullName, topicId, t]);

  const menuItems = useCallback((): SidebarMenuItemData[] => {
    const items: SidebarMenuItemData[] = [];

    if (topicId) {
      items.push(
        {
          icon: <Star />,
          key: 'favorite',
          label: t(isFavorite ? 'actions.unfavorite' : 'actions.favorite', { ns: 'topic' }),
          onClick: () => {
            favoriteTopic(topicId, !isFavorite);
          },
        },
        { type: 'divider' as const },
        {
          icon: <Wand2 />,
          key: 'autoRename',
          label: t('actions.autoRename', { ns: 'topic' }),
          onClick: () => {
            autoRenameTopicTitle(topicId);
          },
        },
        {
          icon: <PencilLine />,
          key: 'rename',
          label: t('rename', { ns: 'common' }),
          onClick: () => {
            openRenameModal({
              defaultValue: topicTitle,
              description: t('renameModal.description', { ns: 'topic' }),
              onSave: async (newTitle) => {
                await updateTopicTitle(topicId, newTitle);
              },
              title: t('renameModal.title', { ns: 'topic' }),
            });
          },
        },
        { type: 'divider' as const },
      );

      if (isDesktop && workingDirectory) {
        items.push({
          icon: <Copy />,
          key: 'copyWorkingDirectory',
          label: t('actions.copyWorkingDirectory', { ns: 'topic' }),
          onClick: () => {
            void navigator.clipboard.writeText(workingDirectory);
            toast.success(t('actions.copyWorkingDirectorySuccess', { ns: 'topic' }));
          },
        });
      }

      if (isDesktop && activeAgentId && !pathname.startsWith('/popup')) {
        items.push({
          icon: <ExternalLink />,
          key: 'openInPopupWindow',
          label: t('inPopup.title', { ns: 'topic' }),
          onClick: () => {
            openTopicInNewWindow(activeAgentId, topicId);
          },
        });
      }

      items.push(
        {
          icon: <FileText />,
          key: 'copyAsMarkdown',
          label: t('copyAsMarkdown', { ns: 'common' }),
          onClick: async () => {
            // Chat-level form of the reference's `Copy as markdown` — the
            // whole topic transcript, built from the same normalized markdown
            // the per-message copyAsMarkdown action produces.
            const key = messageMapKey({ agentId: activeAgentId, topicId });
            const transcript = buildChatMarkdownTranscript(
              useChatStore.getState().dbMessagesMap[key] ?? [],
            );
            if (!transcript) {
              toast.info(t('noContent', { ns: 'common' }));
              return;
            }
            await copyToClipboard(transcript);
            toast.success(t('copySuccess', { ns: 'common' }));
          },
        },
        {
          icon: <Hash />,
          key: 'copySessionId',
          label: t('actions.copySessionId', { ns: 'topic' }),
          onClick: async () => {
            await copyToClipboard(topicId);
            toast.success(t('actions.copySessionIdSuccess', { ns: 'topic' }));
          },
        },
        { type: 'divider' as const },
      );
    }

    if (docId) {
      items.push(
        {
          icon: <Clock3Icon />,
          key: 'open-document-compare',
          label: t('pageEditor.history.compareTitle', { ns: 'file' }),
          onClick: () => {
            void openCompareModal();
          },
        },
        { type: 'divider' as const },
      );
    }

    items.push({
      checked: wideScreen,
      icon: <Maximize2 />,
      key: 'full-width',
      label: t('viewMode.fullWidth'),
      onCheckedChange: toggleWideScreen,
      type: 'switch',
    });

    if (topicId) {
      items.push(
        { type: 'divider' as const },
        {
          danger: true,
          icon: <Trash />,
          key: 'delete',
          label: t('delete', { ns: 'common' }),
          onClick: () => {
            void confirmRemoveTopic({
              onConfirm: async (removeFiles) => {
                await removeTopic(topicId, removeFiles);
              },
              topicIds: [topicId],
            });
          },
        },
      );
    }

    return items;
  }, [
    topicId,
    topicTitle,
    isFavorite,
    activeAgentId,
    pathname,
    workingDirectory,
    wideScreen,
    docId,
    autoRenameTopicTitle,
    favoriteTopic,
    openTopicInNewWindow,
    removeTopic,
    updateTopicTitle,
    toggleWideScreen,
    openCompareModal,
    t,
  ]);

  return { menuHeader, menuItems };
};
