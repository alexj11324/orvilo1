'use client';

import { CircleDashed, PencilIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Task, TaskContent, TaskItem, TaskTrigger } from '@/components/ai-elements/task';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { openCheckEditModal } from './EditModal';
import type { TrayCheck } from './types';

interface CheckItemProps {
  check: TrayCheck;
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<TrayCheck, 'id'>>) => void;
}

const CheckItem = memo<CheckItemProps>(({ check, onRemove, onUpdate }) => {
  const { t } = useTranslation('verify');
  const [open, setOpen] = useState(false);

  return (
    <Task open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <TaskTrigger className="min-w-0 flex-1" title={check.name}>
          <CircleDashed className="size-4 shrink-0" />
          <span className="truncate">{check.name}</span>
        </TaskTrigger>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('acceptance.tray.editModal.editTitle')}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    openCheckEditModal({ initial: check, onRemove, onSubmit: onUpdate })
                  }
                >
                  <PencilIcon />
                </Button>
              }
            />
            <TooltipContent>{t('acceptance.tray.editModal.editTitle')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <TaskContent>
        <TaskItem>
          <p className="font-medium text-foreground">{t('acceptance.tray.section.method')}</p>
          <p>{check.method || t('acceptance.tray.section.methodEmpty')}</p>
        </TaskItem>
      </TaskContent>
    </Task>
  );
});
CheckItem.displayName = 'VerifyTrayCheckItem';
export default CheckItem;
