'use client';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { cn } from 'cn';
import { Trash2 } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import type { ClearTodosParams } from '../../types';

const styles = {
  container: 'rounded-(--ant-border-radius) bg-accent p-3',
  dangerText: 'text-[13px] text-destructive',
  header: 'text-warning',
  label: 'text-[13px] text-muted-foreground',
  normalText: 'text-[13px]',
};

/**
 * ClearTodos Intervention component
 * Allows users to choose between clearing completed items or all items
 */
const ClearTodosIntervention = memo<BuiltinInterventionProps<ClearTodosParams>>(
  ({ args, onArgsChange }) => {
    const { t } = useTranslation('tool');
    const [mode, setMode] = useState<ClearTodosParams['mode']>(args?.mode || 'completed');

    const handleModeChange = useCallback(
      async (value: string) => {
        const newMode = value as ClearTodosParams['mode'];
        setMode(newMode);
        await onArgsChange?.({ mode: newMode });
      },
      [onArgsChange],
    );

    return (
      <div className="flex flex-col gap-3">
        <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
          <Trash2 size={16} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {t('orvilo-agent.clearTodos.header')}
          </span>
        </div>

        <div className={cn('flex', 'flex-col', 'gap-2', styles.container)}>
          <span className={styles.label}>{t('orvilo-agent.clearTodos.label')}</span>
          <RadioGroup className="flex flex-col gap-2" value={mode} onValueChange={handleModeChange}>
            <label className="flex flex-row items-center gap-2">
              <RadioGroupItem value="completed" />
              <span className={styles.normalText}>
                {t('orvilo-agent.clearTodos.option.completed')}
              </span>
            </label>
            <label className="flex flex-row items-center gap-2">
              <RadioGroupItem value="all" />
              <span className={styles.dangerText}>{t('orvilo-agent.clearTodos.option.all')}</span>
            </label>
          </RadioGroup>
        </div>
      </div>
    );
  },
);

ClearTodosIntervention.displayName = 'ClearTodosIntervention';

export default ClearTodosIntervention;
