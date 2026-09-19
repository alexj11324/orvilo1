'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select, Text, toast, useModalContext } from '@lobehub/ui/base-ui';
import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    <Flexbox>
      <Flexbox className={styles.content} gap={8}>
        <Text as="h3" weight="bold">
          {t('myWork.pickWorkflowState')}
        </Text>
        <Text color={cssVar.colorTextSecondary}>{t('myWork.pickWorkflowStateDescription')}</Text>
        {loading ? (
          <Text color={cssVar.colorTextSecondary}>{t('myWork.loading')}</Text>
        ) : failed ? (
          <Text color={cssVar.colorTextSecondary}>{t('myWork.moveFailed')}</Text>
        ) : options.length === 0 ? (
          <Text color={cssVar.colorTextSecondary}>{t('myWork.pickWorkflowStateEmpty')}</Text>
        ) : (
          <Select
            aria-label={t('myWork.pickWorkflowState')}
            options={options}
            placeholder={t('myWork.pickWorkflowState')}
            value={selected}
            onChange={(next) => {
              if (typeof next === 'string') setSelected(next);
            }}
          />
        )}
      </Flexbox>
      <Flexbox horizontal className={styles.actions} gap={8} justify="space-between">
        <Button onClick={handleCancel}>{t('cancel')}</Button>
        <Button disabled={!selected} type="primary" onClick={handleConfirm}>
          {t('myWork.pickWorkflowStateConfirm')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
};
