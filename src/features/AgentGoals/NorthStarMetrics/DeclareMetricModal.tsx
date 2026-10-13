'use client';

import type { OrchestrationWorkflowMetricComparison } from '@orvilo/types';
import { t } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGoalStore } from '@/store/goal';

/**
 * Declare one measured acceptance clause: "this series must reach this
 * number". The key doubles as the series name the probe / manual observations
 * write to, so declaring is enough — the first observation creates the series.
 */
const DeclareMetricContent = memo<{ orchestrationWorkflowId: string }>(
  ({ orchestrationWorkflowId }) => {
    const { t } = useTranslation('chat');
    const { close } = useModalContext();
    const declareGoalMetric = useGoalStore((s) => s.declareGoalMetric);

    const [key, setKey] = useState('');
    const [title, setTitle] = useState('');
    const [op, setOp] = useState<OrchestrationWorkflowMetricComparison>('gte');
    const [target, setTarget] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
      const trimmedKey = key.trim();
      const parsedTarget = Number(target);
      if (!trimmedKey || !Number.isFinite(parsedTarget) || busy) return;
      setBusy(true);
      try {
        await declareGoalMetric(orchestrationWorkflowId, {
          key: trimmedKey,
          op,
          target: parsedTarget,
          title: title.trim() || undefined,
        });
        close();
      } catch (error) {
        // Keep the form open — a silent close would be indistinguishable from success.
        console.error('[NorthStar] failed to declare metric:', error);
        toast.error(t('goalProcess.northStar.declare.failed'));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="flex flex-col gap-4" style={{ paddingBlock: '4px 8px' }}>
        <div className="flex flex-col gap-1.5">
          <div className="text-(length:--text-dense) font-medium">
            {t('goalProcess.northStar.declare.keyLabel')}
          </div>
          <Input
            autoFocus
            placeholder={t('goalProcess.northStar.declare.keyPlaceholder')}
            value={key}
            visualSize="normal"
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-(length:--text-dense) font-medium">
            {t('goalProcess.northStar.declare.titleLabel')}
          </div>
          <Input
            placeholder={t('goalProcess.northStar.declare.titlePlaceholder')}
            value={title}
            visualSize="normal"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col flex-1 gap-1.5">
            <div className="text-(length:--text-dense) font-medium">
              {t('goalProcess.northStar.declare.opLabel')}
            </div>
            <Select
              value={op}
              items={(['gte', 'lte', 'gt', 'lt', 'eq'] as const).map((value) => ({
                label: t(`goalProcess.northStar.op.${value}` as const),
                value,
              }))}
              onValueChange={(value) => setOp(value as OrchestrationWorkflowMetricComparison)}
            >
              <SelectTrigger size="normal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['gte', 'lte', 'gt', 'lt', 'eq'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`goalProcess.northStar.op.${value}` as const)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col flex-1 gap-1.5">
            <div className="text-(length:--text-dense) font-medium">
              {t('goalProcess.northStar.declare.targetLabel')}
            </div>
            <Input
              placeholder={'10000'}
              value={target}
              visualSize="normal"
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!key.trim() || !Number.isFinite(Number(target)) || target.trim() === ''}
            loading={busy}
            size="lg"
            variant="outline"
            onClick={() => void submit()}
          >
            {t('goalProcess.northStar.declare.submit')}
          </Button>
        </div>
      </div>
    );
  },
);

DeclareMetricContent.displayName = 'DeclareMetricContent';

export const openDeclareMetricModal = (orchestrationWorkflowId: string): ModalInstance =>
  createModal({
    content: <DeclareMetricContent orchestrationWorkflowId={orchestrationWorkflowId} />,
    footer: null,
    maskClosable: true,
    title: t('goalProcess.northStar.declare.title', { ns: 'chat' }),
    width: 'min(90%, 480px)',
  });
