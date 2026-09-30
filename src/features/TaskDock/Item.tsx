import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { CopyIcon, ExternalLinkIcon, RotateCwIcon, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';

import type { DockTask } from './type';

const styles = createStaticStyles(({ css }) => ({
  action: css`
    opacity: 0;
    transition: opacity 0.2s ease;
  `,
  container: css`
    &:hover .dock-task-action {
      opacity: 1;
    }
  `,
  progress: css`
    pointer-events: none;

    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 0;

    height: 2px;

    background: ${cssVar.geekblue};

    transition: inset-inline-end 0.2s linear;
  `,
  result: css`
    border-block-start: 1px solid ${cssVar.colorFillQuaternary};
    background: ${cssVar.colorFillQuaternary};
  `,
  resultLabel: css`
    min-width: 0;
    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM}px;
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-size: 14px;
    line-height: 1.4;
    text-overflow: ellipsis;
  `,
}));

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
        <div
          className={`flex items-center gap-3 px-3 py-2 ${styles.container}`}
          style={{ position: 'relative' }}
        >
          {icon}
          <div className="flex flex-1 flex-col gap-0.5" style={{ overflow: 'hidden' }}>
            <div className={styles.title}>{title}</div>
            {detail}
            {extra}
          </div>

          {cancel && (
            <ActionIcon
              className={`${styles.action} dock-task-action`}
              icon={XIcon}
              size="small"
              title={t('cancel')}
              onClick={cancel}
            />
          )}

          {retry && (
            <ActionIcon icon={RotateCwIcon} size="small" title={t('retry')} onClick={retry} />
          )}

          {closable && (
            <ActionIcon icon={XIcon} size="small" title={t('close')} onClick={dismiss} />
          )}

          {status === 'running' && progress !== undefined && (
            <div className={styles.progress} style={{ insetInlineEnd: `${100 - progress}%` }} />
          )}
        </div>

        {result && (
          <div
            className={`flex items-center gap-2 py-1.5 ${styles.result}`}
            style={{ paddingInlineEnd: 8, paddingInlineStart: solo ? 12 : 48 }}
          >
            <div
              className={cn('truncate min-w-0', styles.resultLabel)}
              type={result.onOpen ? undefined : 'secondary'}
            >
              {result.label}
            </div>
            {result.onCopy && (
              <ActionIcon icon={CopyIcon} size="small" title={t('copy')} onClick={result.onCopy} />
            )}
            {result.onOpen && (
              <ActionIcon
                icon={ExternalLinkIcon}
                size="small"
                title={t('taskDock.open')}
                onClick={result.onOpen}
              />
            )}
            {result.action && (
              <Button size="sm" onClick={result.onAction}>
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
