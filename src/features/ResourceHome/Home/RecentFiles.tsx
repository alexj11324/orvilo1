'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import dayjs from 'dayjs';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import FileIcon from '@/components/FileIcon';
import {
  RESOURCE_HOME_SECTIONS,
  ResourceSectionSkeleton,
} from '@/components/Skeleton/ResourceHome';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { getResourceQueryVisibility } from '@/features/ResourceManager/store/selectors';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useClientDataSWR } from '@/libs/swr';
import { resourceKeys } from '@/libs/swr/keys';
import { fileService } from '@/services/file';
import { FilesTabs } from '@/types/files';

import SectionTitle from './SectionTitle';

const styles = {
  card: 'cursor-pointer overflow-hidden flex flex-col p-0 border border-sidebar-border rounded-(--radius-overlay) text-start bg-card [transition:border-color_0.2s_var(--ant-motion-ease-in-out),box-shadow_0.2s_var(--ant-motion-ease-in-out)] hover:border-border hover:shadow-(--ant-box-shadow-tertiary)',
  grid: 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3',
  meta: 'text-[12px] text-(--ant-color-text-quaternary)',
  name: 'truncate text-[13px] font-medium text-foreground',
  preview:
    'flex items-center justify-center aspect-[16/10] w-full [border-block-end:1px_solid_var(--sidebar-border)] bg-(--ant-color-fill-quaternary)',
  thumbnail: 'w-full h-full object-cover',
};

const formatTime = (date: Date | string) =>
  dayjs().diff(dayjs(date), 'd') < 7 ? dayjs(date).fromNow() : formatAbsoluteDate(date);

const RecentFiles = memo(() => {
  const { t } = useTranslation('file');
  const navigate = useWorkspaceAwareNavigate();
  const workspaceId = useActiveWorkspaceId();
  const listVisibility = useResourceManagerStore((s) => s.listVisibility);
  const visibility = workspaceId
    ? getResourceQueryVisibility(undefined, listVisibility)
    : undefined;

  const { data, error, isLoading, mutate } = useClientDataSWR(
    resourceKeys.recentFiles(workspaceId ?? null, visibility),
    () => fileService.getRecentFiles(8, visibility),
  );

  if (!isLoading && !error && !data?.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle title={t('home.recentFiles')} viewAllUrl={`/resource/${FilesTabs.All}`} />
      {error && !data?.length ? (
        <AsyncError error={error} variant={'inline'} onRetry={() => void mutate()} />
      ) : isLoading ? (
        <ResourceSectionSkeleton {...RESOURCE_HOME_SECTIONS.files} />
      ) : (
        <div className={styles.grid}>
          {data?.map((item) => {
            const isImage = item.fileType?.startsWith('image');
            return (
              <button
                className={styles.card}
                key={item.id}
                type={'button'}
                onClick={() => navigate(`/resource?file=${item.id}`)}
              >
                <div className={styles.preview}>
                  {isImage && item.url ? (
                    <img alt={item.name} className={styles.thumbnail} src={item.url} />
                  ) : (
                    <FileIcon fileName={item.name} fileType={item.fileType} size={40} />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.meta}>{formatTime(item.createdAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

RecentFiles.displayName = 'RecentFiles';

export default RecentFiles;
