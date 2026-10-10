'use client';

import { Github } from '@lobehub/icons';
import type { WorkSummaryItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { CheckCircle2Icon, GitPullRequestIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { getWorkTypeDescriptor } from '@/features/Work/descriptors';
import LinearIcon from '@/features/Work/icons/LinearIcon';

const coverStyle = createStaticStyles(
  ({ css }) => css`
    position: relative;

    overflow: hidden;

    height: clamp(160px, 15vw, 220px);
    margin: 7px;
    border-radius: var(--radius-card);

    /* A white top spotlight keeps the flat fill from reading dull. Light and
       dark need different intensities: on the light grey fill the highlight
       must be near-opaque white to register at all, while in dark mode a few
       percent of white already lifts the surface. */
    background:
      radial-gradient(
        140% 110% at 50% 0%,
        color-mix(in srgb, #fff 85%, transparent) 0%,
        color-mix(in srgb, #fff 30%, transparent) 45%,
        transparent 75%
      ),
      ${cssVar.colorFillTertiary};
    box-shadow: inset 0 1px 0 #fff;

    [data-theme='dark'] & {
      background:
        radial-gradient(
          140% 110% at 50% 0%,
          color-mix(in srgb, #fff 10%, transparent) 0%,
          transparent 65%
        ),
        ${cssVar.colorFillQuaternary};
      box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
    }
  `,
);

const styles = {
  cover: coverStyle,
  coverBadge:
    'absolute z-2 inset-bs-2.25 inset-s-2.25 grid size-8.5 place-items-center rounded-(--radius-chip) border border-divider bg-[color-mix(in_srgb,var(--popover)_88%,transparent)] text-foreground backdrop-blur-[12px]',
  grid: 'absolute inset-0 opacity-[0.22] bg-[linear-gradient(var(--divider)_1px,transparent_1px),linear-gradient(90deg,var(--divider)_1px,transparent_1px)] bg-size-[20px_20px]',
  linearBody: 'p-5',
  linearId: 'text-xs leading-5 font-semibold text-foreground-tertiary tracking-[0.04em]',
  linearTitle: 'mbs-1.75 line-clamp-2 text-sm leading-5.5 font-semibold',
  mockWindow:
    'absolute inset-6.5 overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  previewDescription: 'mbs-2 line-clamp-2 text-sm leading-5.5 text-muted-foreground',
  previewBody: 'box-border h-full px-5 pbs-5 pbe-7',
  previewIdentifier: 'text-xs leading-5 font-semibold text-foreground-tertiary',
  previewTitle: 'mbs-1.75 line-clamp-2 text-sm leading-5.5 font-semibold',
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
              <CheckCircle2Icon className="text-foreground" size={22} />
              <div className="text-sm leading-5.5 font-semibold">{title}</div>
            </div>
            <div className={styles.previewDescription}>{description}</div>
          </div>
        ) : (
          <div className={styles.previewBody}>
            <div className="flex items-center gap-1.5">
              {item.resourceType === 'github_pull_request' && (
                <GitPullRequestIcon className="text-foreground-tertiary" size={11} />
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
          <Github size={18} />
        ) : isLinear ? (
          <LinearIcon size={18} />
        ) : (
          <DescriptorIcon size={17} />
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
