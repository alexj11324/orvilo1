'use client';

import type { WorkSummaryItem } from '@orvilo/types';
import { cn } from 'cn';
import { CheckCircle2Icon, GitPullRequestIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Github } from '@/components/BrandIcons';
import { Badge } from '@/components/reui/badge';
import { getWorkTypeDescriptor } from '@/features/Work/descriptors';
import LinearIcon from '@/features/Work/icons/LinearIcon';

const styles = {
  cover:
    'relative overflow-hidden h-[clamp(calc(var(--spacing)*40),15vw,calc(var(--spacing)*55))] m-2 rounded-(--radius-card) bg-muted bg-[radial-gradient(140%_110%_at_50%_0%,color-mix(in_srgb,var(--color-white)_85%,transparent)_0%,color-mix(in_srgb,var(--color-white)_30%,transparent)_45%,transparent_75%)] shadow-[inset_0_1px_0_var(--color-white)] [[data-theme=dark]_&]:bg-fill-quaternary [[data-theme=dark]_&]:bg-[radial-gradient(140%_110%_at_50%_0%,color-mix(in_srgb,var(--color-white)_10%,transparent)_0%,transparent_65%)] [[data-theme=dark]_&]:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-white)_12%,transparent)]',
  coverBadge:
    'absolute z-2 inset-bs-2 inset-s-2 grid size-8 place-items-center rounded-(--radius-chip) border border-divider bg-[color-mix(in_srgb,var(--popover)_88%,transparent)] text-foreground backdrop-blur-[calc(var(--spacing)*3)]',
  grid: 'absolute inset-0 opacity-[0.22] bg-[linear-gradient(var(--divider)_1px,transparent_1px),linear-gradient(90deg,var(--divider)_1px,transparent_1px)] bg-size-[calc(var(--spacing)*5)_calc(var(--spacing)*5)]',
  linearBody: 'p-5',
  linearId: 'text-xs leading-5 font-semibold text-foreground-tertiary tracking-[0.04em]',
  linearTitle: 'mbs-2 line-clamp-2 text-sm leading-5.5 font-semibold',
  mockWindow:
    'absolute inset-6 overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  previewDescription: 'mbs-2 line-clamp-2 text-sm leading-5.5 text-muted-foreground',
  previewBody: 'box-border h-full px-5 pbs-5 pbe-7',
  previewIdentifier: 'text-xs leading-5 font-semibold text-foreground-tertiary',
  previewTitle: 'mbs-2 line-clamp-2 text-sm leading-5.5 font-semibold',
  status: 'absolute z-2 inset-bs-3 inset-e-3 py-0 text-xs leading-5',
  taskBody: 'p-5',
};

const getStatusVariant = (status?: string | null) => {
  const normalized = status?.toLowerCase();
  if (!normalized) return 'secondary';
  if (normalized.includes('done') || normalized.includes('complete') || normalized === 'merged')
    return 'success';
  if (normalized.includes('review') || normalized.includes('progress')) return 'warning';
  if (normalized.includes('open') || normalized.includes('todo')) return 'info';
  return 'secondary';
};

interface WorkPreviewProps {
  item: WorkSummaryItem;
  title: string;
}

const WorkPreview = memo<WorkPreviewProps>(({ item, title }) => {
  const { t } = useTranslation('file');
  const descriptor = getWorkTypeDescriptor(item);
  const DescriptorIcon = descriptor.getIcon(item);
  const description = descriptor.getDescription(item);
  const identifier = descriptor.getIdentifier(item);
  const displayIdentifier =
    item.resourceType.startsWith('github_') && identifier?.includes('#')
      ? `#${identifier.split('#').at(-1)}`
      : identifier;
  const previewIdentifier =
    item.resourceType === 'document' ? t('work.type.document') : displayIdentifier;
  const isGithub = item.resourceType.startsWith('github_');
  const isLinear = item.resourceType.startsWith('linear_');
  const taskStatus = item.resourceType === 'task' ? item.task.status : null;
  const status = item.status || taskStatus;

  return (
    <div className={styles.cover}>
      <div className={styles.grid} />
      <div className={styles.mockWindow}>
        {isLinear ? (
          <div className={styles.linearBody}>
            <div className="flex items-center justify-between">
              <span className={styles.linearId}>{identifier}</span>
            </div>
            <div className={styles.linearTitle}>{title}</div>
            <div className={styles.previewDescription}>{description}</div>
          </div>
        ) : item.resourceType === 'task' ? (
          <div className={cn('flex flex-col gap-2.5', styles.taskBody)}>
            <div className="flex items-center gap-2">
              <CheckCircle2Icon className="size-4 text-foreground" size={16} />
              <div className="text-sm leading-5.5 font-semibold">{title}</div>
            </div>
            <div className={styles.previewDescription}>{description}</div>
          </div>
        ) : (
          <div className={styles.previewBody}>
            <div className="flex items-center gap-1.5">
              {item.resourceType === 'github_pull_request' && (
                <GitPullRequestIcon className="size-3 text-foreground-tertiary" size={12} />
              )}
              <span className={styles.previewIdentifier}>
                {previewIdentifier || item.resourceType}
              </span>
            </div>
            <div className={styles.previewTitle}>{title}</div>
            <div className={styles.previewDescription}>{description}</div>
          </div>
        )}
      </div>
      <div className={styles.coverBadge}>
        {isGithub ? (
          <Github size={16} />
        ) : isLinear ? (
          <LinearIcon size={16} />
        ) : (
          <DescriptorIcon size={16} />
        )}
      </div>
      {/* An orphan's status is the last snapshot of a resource that no longer
          exists, and the badge shares the top-right corner with the card's
          hover Remove action, so drop it once the resource is gone. */}
      {!isLinear && !isGithub && status && !item.resourceDeleted && (
        <Badge className={styles.status} size="xl" variant={getStatusVariant(status)}>
          {status}
        </Badge>
      )}
    </div>
  );
});

WorkPreview.displayName = 'WorkPreview';

export default WorkPreview;
