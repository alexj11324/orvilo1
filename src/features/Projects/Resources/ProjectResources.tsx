'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Button, confirmModal, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { BookOpen, LibraryBigIcon, Plus, Unlink } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getProjectLibraryPath } from '@/features/Projects/Layout/navigation';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { projectService } from '@/services/project';
import type { ProjectDetail } from '@/store/project';

import { openAddResourceModal } from './AddResourceModal';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    padding-block: 12px;
    padding-inline: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: color-mix(in srgb, ${cssVar.colorBgContainer} 82%, ${cssVar.colorFillQuaternary});

    &:hover {
      border-color: ${cssVar.colorBorder};
    }
  `,
  icon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: 10px;

    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorFillQuaternary};
  `,
  list: css`
    display: grid;
    gap: 10px;
  `,
}));

type ProjectResourceLink = NonNullable<ProjectDetail['knowledgeBases']>[number];

interface ProjectResourcesProps {
  detail: ProjectDetail;
  /** Refetch the project detail, so every surface reading it stays in step. */
  onRefresh: () => void;
  projectId: string;
}

const ProjectResources = memo<ProjectResourcesProps>(({ detail, onRefresh, projectId }) => {
  const { t } = useTranslation('project');
  const navigate = useWorkspaceAwareNavigate();
  // One row is enough to hold the page: a second removal would race the first
  // onto the same project row, and the detail refetch that follows resolves
  // both anyway.
  const [busyId, setBusyId] = useState<string | null>(null);

  const links = useMemo<ProjectResourceLink[]>(
    () => detail.knowledgeBases ?? [],
    [detail.knowledgeBases],
  );

  const linkedIds = useMemo(() => new Set(links.map((link) => link.knowledgeBase.id)), [links]);

  const handleAdd = useCallback(() => {
    openAddResourceModal({ linkedIds, onAdded: onRefresh, projectId });
  }, [linkedIds, onRefresh, projectId]);

  const handleOpen = useCallback(
    (knowledgeBaseId: string) => {
      navigate(getProjectLibraryPath(projectId, knowledgeBaseId));
    },
    [navigate, projectId],
  );

  const handleRemove = useCallback(
    (knowledgeBaseId: string, name: string) => {
      confirmModal({
        content: t('resources.removeConfirm.content', { name }),
        okButtonProps: { danger: true },
        okText: t('resources.removeConfirm.ok'),
        onOk: async () => {
          setBusyId(knowledgeBaseId);
          try {
            await projectService.removeKnowledgeBase(projectId, knowledgeBaseId);
            onRefresh();
          } catch {
            toast.error(t('resources.removeError'));
          } finally {
            setBusyId(null);
          }
        },
        title: t('resources.removeConfirm.title'),
      });
    },
    [onRefresh, projectId, t],
  );

  return (
    <Flexbox gap={20} padding={24} style={{ marginInline: 'auto', maxWidth: 840, width: '100%' }}>
      <Flexbox horizontal align={'flex-start'} gap={16} justify={'space-between'}>
        <Flexbox gap={4}>
          <Text fontSize={18} weight={600}>
            {t('resources.title')}
          </Text>
          <Text type={'secondary'}>{t('resources.description')}</Text>
        </Flexbox>
        <Button icon={Plus} type={'primary'} onClick={handleAdd}>
          {t('resources.add')}
        </Button>
      </Flexbox>

      {links.length === 0 ? (
        <Center padding={40}>
          <Empty
            icon={BookOpen}
            description={
              <Flexbox gap={4}>
                <Text>{t('resources.empty.title')}</Text>
                <Text fontSize={12} type={'secondary'}>
                  {t('resources.empty.description')}
                </Text>
              </Flexbox>
            }
          />
        </Center>
      ) : (
        <div className={styles.list}>
          {links.map((link) => {
            const { binding, knowledgeBase } = link;
            const busy = busyId === knowledgeBase.id;

            return (
              <Flexbox
                horizontal
                align={'center'}
                className={styles.card}
                gap={12}
                key={binding.id}
              >
                <span className={styles.icon}>
                  <Icon icon={LibraryBigIcon} size={18} />
                </span>
                <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
                  <Flexbox horizontal align={'center'} gap={8}>
                    <Text ellipsis weight={500}>
                      {knowledgeBase.name}
                    </Text>
                    {!binding.enabled && <Tag>{t('resources.disabled')}</Tag>}
                  </Flexbox>
                  {knowledgeBase.description && (
                    <Text ellipsis fontSize={12} type={'secondary'}>
                      {knowledgeBase.description}
                    </Text>
                  )}
                </Flexbox>
                <Button size={'small'} type={'text'} onClick={() => handleOpen(knowledgeBase.id)}>
                  {t('resources.open')}
                </Button>
                <Button
                  danger
                  disabled={busy}
                  icon={Unlink}
                  loading={busy}
                  size={'small'}
                  type={'text'}
                  onClick={() => handleRemove(knowledgeBase.id, knowledgeBase.name)}
                >
                  {t('resources.remove')}
                </Button>
              </Flexbox>
            );
          })}
        </div>
      )}
    </Flexbox>
  );
});

ProjectResources.displayName = 'ProjectResources';

export default ProjectResources;
