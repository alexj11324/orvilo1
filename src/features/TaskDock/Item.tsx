import { cn } from 'cn';
import { CopyIcon, ExternalLinkIcon, RotateCwIcon, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';

import type { DockTask } from './type';

const styles = {
  action:
    'opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) [@media(hover:none)]:opacity-100',
  container:
    '[&:hover_.dock-task-action]:opacity-100 [&:focus-within_.dock-task-action]:opacity-100',
  progress:
    'pointer-events-none absolute inset-be-0 inset-s-0 h-0.5 bg-primary transition-[inset-inline-end] duration-(--orvilo-motion-mid) ease-linear',
  result: 'border-bs border-divider bg-fill-quaternary',
  resultLabel: 'min-w-0 font-mono text-xs leading-5',
  title: 'overflow-hidden line-clamp-1 text-sm leading-5.5 text-ellipsis',
};

interface ItemProps extends DockTask {
  /** A solo card has no group gutter, so its result strip is flush left. */
  solo?: boolean;
}

const Item = memo<ItemProps>(
  ({ cancel, detail, dismiss, extra, icon, progress, result, retry, solo, status, title }) => {
    const { t } = useTranslation('common');
    // A finished task is the user's to clear. The panel puts that on its
    // header; a solo card has no header, so the row carries it.
    const closable = dismiss && status !== 'running' && status !== 'pending';

    return (
      <div className="flex flex-col">
        <div className={`relative flex items-center gap-3 p-4 ${styles.container}`}>
          {icon}
          <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
            <div className={styles.title}>{title}</div>
            {detail}
            {extra}
          </div>

          {cancel && (
            <ActionIcon
              className={`${styles.action} dock-task-action`}
              icon={XIcon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('cancel')}
              onClick={cancel}
            />
          )}

          {retry && (
            <ActionIcon
              icon={RotateCwIcon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('retry')}
              onClick={retry}
            />
          )}

          {closable && (
            <ActionIcon
              icon={XIcon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('close')}
              onClick={dismiss}
            />
          )}

          {status === 'running' && progress !== undefined && (
            <div className={styles.progress} style={{ insetInlineEnd: `${100 - progress}%` }} />
          )}
        </div>

        {result && (
          <div
            className={cn(
              'flex items-center gap-2 py-1.5 pe-2',
              solo ? 'ps-4' : 'ps-12',
              styles.result,
            )}
          >
            <div
              className={cn(
                'truncate min-w-0',
                styles.resultLabel,
                !result.onOpen && 'text-muted-foreground',
              )}
            >
              {result.label}
            </div>
            {result.onCopy && (
              <ActionIcon
                icon={CopyIcon}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                title={t('copy')}
                onClick={result.onCopy}
              />
            )}
            {result.onOpen && (
              <ActionIcon
                icon={ExternalLinkIcon}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                title={t('taskDock.open')}
                onClick={result.onOpen}
              />
            )}
            {result.action && (
              <Button size="compact" onClick={result.onAction}>
                {result.action}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  },
);

Item.displayName = 'TaskDockItem';

export default Item;
