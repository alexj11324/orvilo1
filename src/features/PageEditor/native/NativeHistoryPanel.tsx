'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { ArrowLeftIcon, Clock3Icon } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModalInstance } from '@/components/Modal';
import { confirmModal } from '@/components/Modal';
import SurfaceSkeleton from '@/components/Skeleton/Surface';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { DOCUMENT_HISTORY_QUERY_LIST_LIMIT } from '@/const/documentHistory';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useEventCallback } from '@/hooks/useEventCallback';
import { useClientDataSWR } from '@/libs/swr';
import type {
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
  ListHistoryOutput,
} from '@/server/routers/lambda/_schema/documentHistory';
import { documentService } from '@/services/document';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import {
  createDocumentCompareModal,
  type DocumentHistoryDiffRenderer,
} from '../History/CompareModal/createDocumentCompareModal';
import { formatHistoryAbsoluteTime } from '../History/formatHistoryDate';
import { HistoryItemsProvider } from '../History/HistoryItemsProvider';
import { HistoryListItem } from '../History/HistoryListItem';
import { usePageAgentPanelControl } from '../RightPanel/OverrideContext';
import type { NativePageChromeState } from './NativePageEditorAssembler';
import { restoreNativeHistory } from './restoreNativeHistory';

interface HistoryDayGroup {
  historyIds: string[];
  key: string;
  label: string;
}

const styles = {
  empty: 'h-full p-6',
  groupHeader:
    'sticky inset-bs-0 z-1 flex items-baseline gap-2 border-be border-divider bg-card pbs-3.5 pbe-1.5 px-4',
  groupTitle: 'text-xs leading-5 font-bold text-foreground',
  groupCount: 'text-xs leading-5 text-foreground-tertiary',
  headerButton: 'px-2',
  list: 'min-h-0 flex-1 overflow-y-auto pbs-0 pbe-5',
};

export const NativeHistoryPanel = memo(
  ({
    state,
    renderDiff,
  }: {
    state: NativePageChromeState;
    renderDiff: DocumentHistoryDiffRenderer;
  }) => {
    const { t } = useTranslation(['common', 'file']);

    const { documentId, editor, setRightPanelMode } = state;
    const latest = useRef(state);
    latest.current = state;
    const alive = useRef(true);
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);

    const { expand: showPageAgentPanel, toggle: togglePageAgentPanel } = usePageAgentPanelControl();

    const lastUpdatedTime = useDocumentStore(
      (s) => editorSelectors.lastUpdatedTime(documentId!)(s) ?? null,
    );

    const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null);
    const compareInstanceRef = useRef<ModalInstance | null>(null);
    useEffect(() => () => compareInstanceRef.current?.destroy(), []);
    const assertOwner = () => {
      const current = latest.current;
      const store = useDocumentStore.getState();
      if (
        !alive.current ||
        current.documentId !== documentId ||
        current.editor !== editor ||
        !current.editable ||
        !editor?.getLexicalEditor()?.isEditable() ||
        store.activeDocumentId !== documentId ||
        store.editor !== editor ||
        !store.documents[documentId] ||
        store.documents[documentId]?.saveBlockedByLock
      ) {
        throw new Error('Native history restore no longer owns an editable document');
      }
    };

    const { data, isLoading } = useClientDataSWR<ListHistoryOutput>(
      documentId ? ['page-editor-document-history', documentId, lastUpdatedTime] : null,
      async () =>
        documentService.listDocumentHistory({
          documentId: documentId!,
          includeCurrent: true,
          limit: DOCUMENT_HISTORY_QUERY_LIST_LIMIT,
        }),
      { keepPreviousData: true },
    );

    const items = useMemo(() => data?.items ?? [], [data?.items]);
    const historyItemsById = useMemo<Record<string, DocumentHistoryListItem>>(() => {
      const nextItemsById: Record<string, DocumentHistoryListItem> = {};

      for (const item of items) {
        nextItemsById[item.id] = item;
      }

      return nextItemsById;
    }, [items]);

    const groups = useMemo<HistoryDayGroup[]>(() => {
      const now = dayjs();
      const todayLabel = t('pageEditor.history.dayLabel.today', { ns: 'file' });
      const yesterdayLabel = t('pageEditor.history.dayLabel.yesterday', { ns: 'file' });

      const map = new Map<string, HistoryDayGroup>();

      for (const item of items) {
        const d = dayjs(item.savedAt);
        const key = d.format('YYYY-MM-DD');
        const group = map.get(key);

        if (group) {
          group.historyIds.push(item.id);
          continue;
        }

        let label: string;
        if (d.isSame(now, 'day')) label = todayLabel;
        else if (d.isSame(now.subtract(1, 'day'), 'day')) label = yesterdayLabel;
        else label = formatAbsoluteDate(d);

        map.set(key, { historyIds: [item.id], key, label });
      }

      return [...map.values()];
    }, [items, t]);

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

    const handleRestore = useEventCallback((historyId: string, onSuccess?: () => void) => {
      const item = historyItemsById[historyId];

      if (!documentId || !editor || !state.editable || !item || item.isCurrent) return;

      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('pageEditor.history.restoreConfirm.content', {
          ns: 'file',
          savedAt: formatHistoryAbsoluteTime(item.savedAt),
        }),
        okText: t('pageEditor.history.restore', { ns: 'file' }),
        onOk: async () => {
          setRestoringHistoryId(historyId);

          try {
            await restoreNativeHistory({
              assertOwner,
              beforeRestore: () => latest.current.metadata.flush(),
              load: () =>
                documentService.getDocumentHistoryItem(
                  { documentId, historyId },
                  `page-editor-history-${documentId}`,
                ),
              apply: (editorData) => editor.setDocument('json', JSON.stringify(editorData)),
              save: async () => {
                const store = useDocumentStore.getState();
                store.markDirty(documentId);
                await store.commitEditorMutation(documentId, {
                  restoreFromHistoryId: historyId,
                  saveSource: 'restore',
                });
                if (useDocumentStore.getState().documents[documentId]?.isDirty)
                  throw new Error('Native history restore did not persist');
              },
            });
            onSuccess?.();
          } catch (error) {
            console.error('[PageEditor] Failed to restore history item:', error);
            toast.error(t('pageEditor.history.restoreError', { ns: 'file' }));
            throw error;
          } finally {
            setRestoringHistoryId(null);
          }
        },
        title: t('pageEditor.history.restoreConfirm.title', { ns: 'file' }),
      });
    });

    const openCompareModal = useEventCallback((initialHistoryId: string) => {
      if (!documentId) return;

      compareInstanceRef.current?.destroy();

      const instance = createDocumentCompareModal({
        documentId,
        initialHistoryId,
        renderDiff,
        items,
        onRestore: (item) => handleRestore(item.id, () => instance.close()),
        saveSourceLabels,
        canRestore: state.editable,
      });
      compareInstanceRef.current = instance;
    });

    if (!documentId) return null;

    return (
      <div className="flex h-full flex-1 flex-col">
        <NavHeader
          showTogglePanelButton={false}
          left={
            <div className="ms-2 min-w-0 truncate text-sm leading-5.5 font-medium text-muted-foreground">
              {t('pageEditor.history.title', { ns: 'file' })}
            </div>
          }
          right={
            <>
              <Button
                className={cn(styles.headerButton, 'text-sm leading-5.5')}
                size="compact"
                type="button"
                variant="ghost"
                onClick={() => setRightPanelMode('copilot')}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                {t('pageEditor.history.backToCopilot', { ns: 'file' })}
              </Button>
              <ToggleRightPanelButton
                expand={showPageAgentPanel}
                showActive={false}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                onToggle={() => togglePageAgentPanel()}
              />
            </>
          }
        />

        {isLoading && !data ? (
          <div className={cn('flex flex-col items-center justify-center', styles.empty)}>
            <SurfaceSkeleton header={false} variant={'list'} />
          </div>
        ) : items.length === 0 ? (
          <div className={cn('flex flex-col items-center justify-center', styles.empty)}>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock3Icon />
                </EmptyMedia>
                <EmptyDescription>{t('pageEditor.history.empty', { ns: 'file' })}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <HistoryItemsProvider items={items} restoringHistoryId={restoringHistoryId}>
            <div className={cn('flex flex-col gap-0', styles.list)}>
              {groups.map((group) => (
                <div className="flex flex-col gap-0" key={group.key}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupTitle}>{group.label}</span>
                    <span className={styles.groupCount}>
                      {t('pageEditor.history.versionCount', {
                        count: group.historyIds.length,
                        ns: 'file',
                      })}
                    </span>
                  </div>

                  {group.historyIds.map((historyId) => (
                    <HistoryListItem
                      canRestore={state.editable}
                      historyId={historyId}
                      key={historyId}
                      onCompare={openCompareModal}
                      onRestore={handleRestore}
                    />
                  ))}
                </div>
              ))}
            </div>
          </HistoryItemsProvider>
        )}
      </div>
    );
  },
);

NativeHistoryPanel.displayName = 'NativeHistoryPanel';
