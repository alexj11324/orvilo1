'use client';

import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { lambdaClient } from '@/libs/trpc/client';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    padding: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  content: css`
    padding-block: 20px 16px;
    padding-inline: 20px;
  `,
}));

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
  const [states, setStates] = useState<TeamWorkflowStateItem[] | null>(null);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void lambdaClient.team.team
      .query({ teamId })
      .then((result) => {
        if (cancelled) return;
        const next = (result.data.workflowStates ?? []).filter(
          (state) => state.category === category,
        );
        setStates(next);
        setSelected(next[0]?.id);
      })
      .catch((error) => {
        console.error('[WorkflowStatePicker] Failed to load workflow states:', error);
        if (!cancelled) {
          setFailed(true);
          toast.error(t('myWork.moveFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, t, teamId]);

  const options = useMemo(
    () => (states ?? []).map((state) => ({ label: state.name, value: state.id })),
    [states],
  );

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
      <div className={cn('flex flex-col', styles.content)} style={{ gap: 8 }}>
        <h3 className="text-sm font-bold">{t('myWork.pickWorkflowState')}</h3>
        <span className="text-sm" style={{ color: cssVar.colorTextSecondary }}>
          {t('myWork.pickWorkflowStateDescription')}
        </span>
        {loading ? (
          <span className="text-sm" style={{ color: cssVar.colorTextSecondary }}>
            {t('myWork.loading')}
          </span>
        ) : failed ? (
          <span className="text-sm" style={{ color: cssVar.colorTextSecondary }}>
            {t('myWork.moveFailed')}
          </span>
        ) : options.length === 0 ? (
          <span className="text-sm" style={{ color: cssVar.colorTextSecondary }}>
            {t('myWork.pickWorkflowStateEmpty')}
          </span>
        ) : (
          <Select
            value={selected}
            onValueChange={(next) => {
              if (typeof next === 'string') setSelected(next);
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
        className={cn('flex flex-row', styles.actions)}
        style={{ justifyContent: 'space-between', gap: 8 }}
      >
        <Button variant="outline" onClick={handleCancel}>
          {t('cancel')}
        </Button>
        <Button disabled={!selected} variant="default" onClick={handleConfirm}>
          {t('myWork.pickWorkflowStateConfirm')}
        </Button>
      </div>
    </div>
  );
};
