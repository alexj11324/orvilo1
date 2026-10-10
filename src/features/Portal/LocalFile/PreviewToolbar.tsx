import { cn } from 'cn';
import { type LucideIcon } from 'lucide-react';
import type { MouseEventHandler, ReactNode } from 'react';
import { createElement, memo } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { SimpleTooltip } from '../SimpleTooltip';
import PathBreadcrumb from './PathBreadcrumb';

const styles = {
  action:
    'cursor-pointer gap-1.5 px-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed',
  actionActive: 'bg-selected text-foreground hover:bg-selected',
  actionLabel: 'whitespace-nowrap [@container(max-width:300px)]:hidden',
  actions: '[@container(max-width:300px)]:[&_.toggle-group-item-label]:hidden',
  bar: '@container shrink-0 h-10 ps-3 pe-2 border-b border-divider bg-card',
  // Hide the path only when the actions slot has actual element children.
  path: 'overflow-hidden min-w-0 text-xs leading-5 font-(family-name:--ant-font-family-code) [@container(max-width:440px)]:[&:has(~[data-toolbar-actions]>*)]:hidden',
};

interface ToolbarActionButtonProps {
  active?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label?: ReactNode;
  loading?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
}

export const ToolbarActionButton = memo<ToolbarActionButtonProps>(
  ({ active, disabled, icon, label, loading, onClick, title }) => {
    const button = (
      <Button
        aria-label={title ?? (typeof label === 'string' ? label : undefined)}
        aria-pressed={active}
        className={cn(styles.action, active && styles.actionActive)}
        disabled={disabled || loading}
        size={'compact'}
        type={'button'}
        variant={'ghost'}
        onClick={onClick}
      >
        <span className="inline-flex items-center" role="img">
          {loading ? (
            <Spinner className="size-3.5" />
          ) : (
            createElement(icon, {
              className: 'size-3.5',
              size: 14,
              width: 14,
              height: 14,
              fill: 'transparent',
            })
          )}
        </span>
        {label && <span className={styles.actionLabel}>{label}</span>}
      </Button>
    );

    return title ? <SimpleTooltip title={title}>{button}</SimpleTooltip> : button;
  },
);

ToolbarActionButton.displayName = 'ToolbarActionButton';

interface PreviewToolbarProps {
  actions?: ReactNode;
  /** Remote device the file lives on; local when absent. */
  deviceId?: string;
  path: string;
  /** Project root the path is shown relative to, when the file lives inside it. */
  rootPath?: string;
}

const PreviewToolbar = memo<PreviewToolbarProps>(({ actions, deviceId, path, rootPath }) => (
  <div className={cn('flex flex-row items-center gap-2 justify-between', styles.bar)}>
    <SimpleTooltip title={path}>
      <div className={cn('flex flex-row items-center flex-1', styles.path)}>
        <PathBreadcrumb deviceId={deviceId} path={path} rootPath={rootPath} />
      </div>
    </SimpleTooltip>
    {actions && (
      <div
        data-toolbar-actions
        className={cn('flex flex-row items-center flex-none gap-0.5 ms-auto', styles.actions)}
      >
        {actions}
      </div>
    )}
  </div>
));

PreviewToolbar.displayName = 'PreviewToolbar';

export default PreviewToolbar;
