'use client';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cn } from 'cn';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFetchWorkTeam } from '@/store/workTeam/hooks';

export interface WorkflowStatePickerContentProps {
  category: TaskWorkflowCategory;
  onCancel: () => void;
  onPick: (workflowStateRefId: string) => void;
  teamId: string;
}

export const WorkflowStatePickerContent = ({
  category,
  onCancel,
  onPick,
  teamId,
}: WorkflowStatePickerContentProps) => {
  const { t } = useTranslation('common');
  const { close } = useModalContext();
  const { data, error, isLoading: loading, isValidating, mutate } = useFetchWorkTeam(teamId);
  const [selection, setSelection] = useState<{
    teamId: string;
    category: TaskWorkflowCategory;
    id: string;
  }>();
  const states = (data?.data.workflowStates ?? []).filter((state) => state.category === category);
  const options = states.map((state) => ({ label: state.name, value: state.id }));
  const selected =
    selection?.teamId === teamId &&
    selection.category === category &&
    states.some((state) => state.id === selection.id)
      ? selection.id
      : states[0]?.id;

  const handleCancel = () => {
    onCancel();
    close();
  };

  const handleConfirm = () => {
    if (!selected) return;
    onPick(selected);
    close();
  };

  return (
    <div className="flex flex-col">
      <div className={cn('flex flex-col', 'pbs-5 pbe-4 px-5', 'gap-2')}>
        <h3 className="text-xl font-semibold leading-7">{t('myWork.pickWorkflowState')}</h3>
        <span className="text-sm text-muted-foreground">
          {t('myWork.pickWorkflowStateDescription')}
        </span>
        {error && (
          <AsyncError
            error={error}
            retrying={isValidating}
            variant="inline"
            onRetry={() => void mutate().catch(() => undefined)}
          />
        )}
        {loading ? (
          <span className="text-sm text-muted-foreground">{t('myWork.loading')}</span>
        ) : error && !data ? null : options.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            {t('myWork.pickWorkflowStateEmpty')}
          </span>
        ) : (
          <Select
            items={options}
            value={selected}
            onValueChange={(next) => {
              if (typeof next === 'string') setSelection({ teamId, category, id: next });
            }}
          >
            <SelectTrigger aria-label={t('myWork.pickWorkflowState')}>
              <SelectValue placeholder={t('myWork.pickWorkflowState')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div
        className={cn(
          'flex flex-row',
          'p-4 border-bs border-solid border-divider',
          'justify-between gap-2',
        )}
      >
        <Button size="lg" variant="outline" onClick={handleCancel}>
          {t('cancel')}
        </Button>
        <Button disabled={!selected} size="lg" variant="default" onClick={handleConfirm}>
          {t('myWork.pickWorkflowStateConfirm')}
        </Button>
      </div>
    </div>
  );
};
