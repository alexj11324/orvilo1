import { cn } from 'cn';
import { FolderGit2Icon, FolderIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Github } from '@/components/BrandIcons';

const styles = {
  dot: 'shrink-0 size-1.5 rounded-full bg-success',
  header: 'cursor-pointer shrink-0 pbs-3.5 pbe-0.5 ps-4 pe-3.5',
  identity: 'overflow-hidden flex flex-1 flex-col gap-0.5 min-w-0',
  name: 'overflow-hidden text-sm leading-5.5 font-semibold text-ellipsis whitespace-nowrap',
  sub: 'overflow-hidden flex gap-1.5 items-center text-xs leading-5 text-foreground-tertiary text-ellipsis whitespace-nowrap',
  subText: 'overflow-hidden text-ellipsis whitespace-nowrap',
  tile: 'grid shrink-0 place-items-center size-8 border border-divider rounded-(--radius-card) text-foreground bg-muted',
};

interface OverviewHeaderProps {
  deviceId?: string;
  error?: boolean;
  name: string;
  onClick?: () => void;
  path: string;
  repoType?: string;
}

const OverviewHeader = memo<OverviewHeaderProps>(
  ({ deviceId, error, name, onClick, path, repoType }) => {
    const { t } = useTranslation('chat');

    return (
      <div
        className={cn('flex items-center gap-2.5', styles.header)}
        role={'button'}
        title={path}
        onClick={onClick}
      >
        <span className={styles.tile}>
          {repoType === 'github' ? (
            <Github size={16} />
          ) : (
            createElement(repoType ? FolderGit2Icon : FolderIcon, { size: 16 })
          )}
        </span>
        <span className={styles.identity}>
          <span className={styles.name}>{name}</span>
          <span className={styles.sub}>
            <i
              className={cn(
                styles.dot,
                error ? 'bg-destructive' : deviceId ? 'bg-info' : undefined,
              )}
            />
            <span className={styles.subText}>
              {t(
                deviceId
                  ? 'workingPanel.overview.execution.device'
                  : 'workingPanel.overview.execution.local',
              )}
              {' · '}
              {path}
            </span>
          </span>
        </span>
      </div>
    );
  },
);

OverviewHeader.displayName = 'OverviewHeader';

export default OverviewHeader;
