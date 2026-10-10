'use client';

import type { BuiltinInterventionProps } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { Clock } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import InputNumber from '@/components/InputNumber';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import type { ExecuteTaskParams } from '../../types';

const styles = {
  agentTitle: 'text-[14px] font-semibold text-foreground',
  container: 'rounded-[var(--ant-border-radius)] py-3',
  timeoutInput: 'w-[100px]',
};

const DEFAULT_TIMEOUT = 1_800_000; // 30 minutes

/**
 * ExecuteTask Intervention Component
 *
 * Allows users to review and modify the task description before execution.
 */
const ExecuteTaskIntervention = memo<BuiltinInterventionProps<ExecuteTaskParams>>(
  ({ args, onArgsChange, registerBeforeApprove }) => {
    const { t } = useTranslation('tool');

    // Get agent info from store
    const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
    const agent = useAgentGroupStore((s) =>
      args?.agentId && activeGroupId
        ? agentGroupSelectors.getAgentByIdFromGroup(activeGroupId, args.agentId)(s)
        : undefined,
    );

    // Local state
    const [instruction, setInstruction] = useState(args?.instruction || '');
    const [timeout, setTimeoutMs] = useState(args?.timeout ?? DEFAULT_TIMEOUT);
    const [hasChanges, setHasChanges] = useState(false);

    // Sync local state when args change externally
    useEffect(() => {
      if (!hasChanges) {
        setInstruction(args?.instruction || '');
        setTimeoutMs(args?.timeout ?? DEFAULT_TIMEOUT);
      }
    }, [args?.instruction, args?.timeout, hasChanges]);

    // Handle instruction change
    const handleInstructionChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
      setInstruction(e.target.value);
      setHasChanges(true);
    }, []);

    // Handle timeout change (minutes to milliseconds)
    const handleTimeoutChange = useCallback((value: number | null) => {
      if (value !== null) {
        setTimeoutMs(value * 60 * 1000); // Convert minutes to milliseconds
        setHasChanges(true);
      }
    }, []);

    // Save changes before approval
    useEffect(() => {
      if (!registerBeforeApprove) return;

      const cleanup = registerBeforeApprove('executeTask', async () => {
        if (hasChanges && onArgsChange) {
          await onArgsChange({ ...args, instruction, timeout });
        }
      });

      return cleanup;
    }, [registerBeforeApprove, hasChanges, instruction, timeout, args, onArgsChange]);

    return (
      <div className={cn('flex', 'flex-col', 'gap-3', styles.container)}>
        {/* Header: Agent info + Timeout */}
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center flex-1 gap-3" style={{ minWidth: 0 }}>
            <Avatar
              avatar={agent?.avatar || '🤖'}
              background={agent?.backgroundColor || undefined}
              size={24}
              style={{ borderRadius: 8, flexShrink: 0 }}
            />
            <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0 }}>
              <span className={styles.agentTitle}>
                {agent?.title || t('agentGroupManagement.executeTask.intervention.unknownAgent')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <Clock size={14} />
                  </span>
                }
              />
              <TooltipContent>
                {t('agentGroupManagement.executeTask.intervention.timeout')}
              </TooltipContent>
            </Tooltip>
            <InputNumber
              className={styles.timeoutInput}
              max={120}
              min={1}
              value={Math.round(timeout / 60_000)}
              onChange={handleTimeoutChange}
            />
            <span className="text-muted-foreground">
              {t('agentGroupManagement.executeTask.intervention.timeoutUnit')}
            </span>
          </div>
        </div>

        {/* Instruction input */}
        <Textarea
          placeholder={t('agentGroupManagement.executeTask.intervention.taskPlaceholder')}
          value={instruction}
          onChange={handleInstructionChange}
        />
      </div>
    );
  },
  isEqual,
);

ExecuteTaskIntervention.displayName = 'ExecuteTaskIntervention';

export default ExecuteTaskIntervention;
