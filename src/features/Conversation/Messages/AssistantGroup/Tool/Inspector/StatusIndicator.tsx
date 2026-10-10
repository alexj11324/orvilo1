import { type ToolIntervention } from '@orvilo/types';
import {
  AlertTriangle,
  Ban,
  Check,
  CornerUpRight,
  HandIcon,
  type LucideIcon,
  PauseIcon,
  X,
} from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LOADING_FLAT } from '@/const/message';

interface StatusIndicatorProps {
  intervention?: ToolIntervention;
  /**
   * Whether the tool is currently executing (from operation state).
   * When false and result exists, treat as completed even if content is empty.
   */
  isToolExecuting?: boolean;
  result?: { content: string | null; error?: any; state?: any };
  /**
   * Glyph for the completed state (defaults to a checkmark). Lets tools whose
   * point is not "an action succeeded" keep their own semantic — e.g.
   * askUserQuestion completes as a question mark, not a task tick.
   */
  successIcon?: LucideIcon;
  /** Successful tool payload that should surface as warning (e.g. activateTools with only notFound). */
  successVariant?: 'default' | 'warning';
}

const StatusIndicator = memo<StatusIndicatorProps>(
  ({ intervention, isToolExecuting, result, successIcon, successVariant }) => {
    const { t } = useTranslation('chat');

    const hasError = !!result?.error;
    const hasSuccessResult = !!result?.content && result.content !== LOADING_FLAT;
    const hasResult = hasSuccessResult || hasError;
    const isPending = intervention?.status === 'pending';
    const isReject = intervention?.status === 'rejected';
    const isAbort = intervention?.status === 'aborted';

    // Tool is complete if operation is not running and we have a result object (even if content is empty)
    const isToolComplete = isToolExecuting === false && !!result;

    let icon;

    if (isAbort) {
      icon = (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <PauseIcon className="text-foreground-tertiary" />
                </span>
              }
            />
            <TooltipContent>{t('tool.intervention.toolAbort')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    } else if (isReject) {
      // A user skip (e.g. AskUserQuestion) is a normal outcome, not a denial —
      // keep the glyph and copy neutral instead of the rejection ban sign.
      icon = intervention?.skipped ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <CornerUpRight className="text-foreground-tertiary" />
                </span>
              }
            />
            <TooltipContent>{t('tool.intervention.toolSkipped')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Ban className="text-foreground-tertiary" />
                </span>
              }
            />
            <TooltipContent>{t('tool.intervention.toolRejected')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    } else if (hasError) {
      icon = <X className="text-destructive-text" />;
    } else if (isPending) {
      icon = <HandIcon className="text-info-text" />;
    } else if (hasSuccessResult && !hasError && successVariant === 'warning') {
      icon = <AlertTriangle className="text-warning-text" />;
    } else if (hasResult || isToolComplete) {
      icon = createElement(successIcon ?? Check, { className: 'text-success-text' });
    } else {
      icon = <NeuralNetworkLoading size={16} />;
    }

    return (
      <div className="flex size-6 flex-none items-center justify-center gap-1 rounded-full border border-border text-xs leading-5">
        {icon}
      </div>
    );
  },
);

export default StatusIndicator;
