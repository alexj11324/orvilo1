'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import {
  Button,
  createModal,
  type ModalInstance,
  Skeleton,
  Tag,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { t as translate } from 'i18next';
import { BookOpen, LibraryBigIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { projectService } from '@/services/project';
import { useKnowledgeBaseStore } from '@/store/library';
import { getLibraryListAsyncState } from '@/utils/libraryListAsyncState';

const styles = createStaticStyles(({ css }) => ({
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 12px;
    border-radius: 10px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

interface AddResourceContentProps {
  /** Libraries the project already references — shown as taken, not hidden. */
  linkedIds: Set<string>;
  onAdded: () => void;
  projectId: string;
}

export const AddResourceContent = memo<AddResourceContentProps>(
  ({ linkedIds, onAdded, projectId }) => {
    const { t } = useTranslation('project');
    const useFetchKnowledgeBaseList = useKnowledgeBaseStore((s) => s.useFetchKnowledgeBaseList);
    const { data, isLoading, isValidating } = useFetchKnowledgeBaseList();
    // A library added in this session keeps its "added" state locally too, so the
    // row does not flicker back to actionable while the project detail refetches.
    const [justAdded, setJustAdded] = useState<Set<string>>(() => new Set());
    const [pendingId, setPendingId] = useState<string | null>(null);

    const handleAdd = useCallback(
      async (knowledgeBaseId: string) => {
        setPendingId(knowledgeBaseId);
        try {
          await projectService.addKnowledgeBase(projectId, knowledgeBaseId);
          setJustAdded((previous) => new Set(previous).add(knowledgeBaseId));
          onAdded();
        } catch {
          toast.error(t('resources.addError'));
        } finally {
          setPendingId(null);
        }
      },
      [onAdded, projectId, t],
    );

    // The store's SWR carries `fallbackData: []`, so `isLoading` alone is false
    // during the first fetch and an `isEmpty` check on it would claim the reader
    // has no libraries for as long as the request takes. The shared derivation
    // counts in-flight validation over empty data as unsettled instead.
    const { isEmpty, isLoading: showSkeleton } = getLibraryListAsyncState({
      data,
      isLoading,
      isValidating,
    });

    if (showSkeleton)
      return (
        <Flexbox>
          <Skeleton.Text rows={8} />
        </Flexbox>
      );

    if (isEmpty)
      return (
        <Center padding={32}>
          <Empty
            description={t('resources.addModal.empty')}
            descriptionProps={{ fontSize: 14 }}
            icon={BookOpen}
          />
        </Center>
      );

    return (
      <Flexbox gap={2} style={{ maxHeight: 420, overflowY: 'auto' }}>
        {(data ?? []).map((library) => {
          const linked = linkedIds.has(library.id) || justAdded.has(library.id);

          return (
            <div className={styles.row} key={library.id}>
              <Icon icon={LibraryBigIcon} size={18} />
              <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
                <Text ellipsis weight={500}>
                  {library.name}
                </Text>
                {library.description && (
                  <Text ellipsis fontSize={12} type={'secondary'}>
                    {library.description}
                  </Text>
                )}
              </Flexbox>
              {linked ? (
                <Tag>{t('resources.addModal.added')}</Tag>
              ) : (
                <Button
                  loading={pendingId === library.id}
                  size={'small'}
                  onClick={() => handleAdd(library.id)}
                >
                  {t('resources.add')}
                </Button>
              )}
            </div>
          );
        })}
      </Flexbox>
    );
  },
);

AddResourceContent.displayName = 'AddResourceContent';

type OpenAddResourceModalOptions = AddResourceContentProps;

/**
 * Picks a library to reference from the project. The modal stays open after an
 * add so several libraries can be attached in one pass — the project page
 * behind it refreshes on each one.
 */
export const openAddResourceModal = ({
  linkedIds,
  onAdded,
  projectId,
}: OpenAddResourceModalOptions): ModalInstance =>
  createModal({
    content: <AddResourceContent linkedIds={linkedIds} projectId={projectId} onAdded={onAdded} />,
    footer: false,
    styles: { content: { overflow: 'hidden' } },
    title: translate('resources.addModal.title', { ns: 'project' }),
    width: 520,
  });
