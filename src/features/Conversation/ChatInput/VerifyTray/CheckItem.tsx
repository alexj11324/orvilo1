'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { CircleDashed, PencilIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Task, TaskContent, TaskTrigger } from '@/components/ai-elements/task';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { openCheckEditModal } from './EditModal';
import type { TrayCheck } from './types';

const styles = createStaticStyles(({ css }) => ({
  detail: css`
    padding-block: 2px 4px;
    padding-inline-start: 22px;
  `,
  head: css`
    cursor: pointer;
    user-select: none;
  `,
  method: css`
    color: ${cssVar.colorTextSecondary};
  `,
  row: css`
    padding-block: 6px;
    padding-inline: 14px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &:hover .verify-tray-row-edit,
    &:focus-within .verify-tray-row-edit {
      opacity: 1;
    }
  `,
  rowEdit: css`
    opacity: 0;
    transition: opacity 0.15s;
  `,
  secLabel: css`
    font-size: 10px;
    color: ${cssVar.colorTextQuaternary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
}));

interface CheckItemProps {
  check: TrayCheck;
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<TrayCheck, 'id'>>) => void;
}

const CheckItem = memo<CheckItemProps>(({ check, onRemove, onUpdate }) => {
  const { t } = useTranslation('verify');
  const [open, setOpen] = useState(false);

  return (
    <Task className={cn('flex flex-col gap-2', styles.row)} open={open} onOpenChange={setOpen}>
      <div className={cn('flex items-center gap-2 justify-between', styles.head)}>
        <TaskTrigger className="min-w-0 flex-1" title={check.name}>
          {/* Draft item has no verdict yet — a neutral glyph, not a false pass/fail. */}
          <CircleDashed color={cssVar.colorTextQuaternary} size={14} />
          <span className="truncate text-sm">{check.name}</span>
        </TaskTrigger>
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      aria-label={t('edit', { ns: 'common' })}
                      className={cx('verify-tray-row-edit', styles.rowEdit)}
                      icon={PencilIcon}
                      size={'small'}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCheckEditModal({ initial: check, onRemove, onSubmit: onUpdate });
                      }}
                    />
                  </span>
                }
              />
              <TooltipContent>{t('acceptance.tray.editModal.editTitle')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <TaskContent>
        <div className={cn('flex flex-col', styles.detail)} style={{ gap: 5 }}>
          <div className={styles.secLabel}>{t('acceptance.tray.section.method')}</div>
          <div className={cn('text-[12px]', styles.method)}>
            {check.method || t('acceptance.tray.section.methodEmpty')}
          </div>
        </div>
      </TaskContent>
    </Task>
  );
});

CheckItem.displayName = 'VerifyTrayCheckItem';

export default CheckItem;
