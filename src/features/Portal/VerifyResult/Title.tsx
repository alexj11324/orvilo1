import { clsx, cn } from 'cn';
import { CheckCircle2, Circle, CircleAlert, LoaderCircle, XCircle } from 'lucide-react';

import type { VerifyCheckResultItem } from '@/database/schemas/verify';
import { useVerifyResults, useVerifyState } from '@/features/Acceptance/hooks';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const styles = {
  badge:
    'inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 font-semibold',
} as const;

const statusMeta = (
  status: VerifyCheckResultItem['status'] | undefined,
): { className: string; icon: typeof CheckCircle2 } => {
  switch (status) {
    case 'passed': {
      return { className: 'bg-success-wash text-success-text', icon: CheckCircle2 };
    }
    case 'running': {
      return { className: 'bg-info-wash text-info-text', icon: LoaderCircle };
    }
    case 'failed': {
      return { className: 'bg-destructive-wash text-destructive-text', icon: XCircle };
    }
    case 'skipped': {
      return { className: 'bg-muted text-muted-foreground', icon: CircleAlert };
    }
    default: {
      return { className: 'bg-muted text-muted-foreground', icon: Circle };
    }
  }
};

const Title = () => {
  const operationId = useChatStore(chatPortalSelectors.verifyResultOperationId);
  const checkItemId = useChatStore(chatPortalSelectors.verifyResultCheckItemId);
  const { data: state } = useVerifyState(operationId ?? null);
  const { data: results } = useVerifyResults(operationId ?? null);

  const item = (state?.verifyPlan ?? []).find((i) => i.id === checkItemId);
  const result = (results ?? []).find((r) => r.checkItemId === checkItemId);

  const sIcon = statusMeta(result?.status);
  const label = result?.verdict ?? result?.status;

  return (
    <div className="flex min-w-0 flex-row items-center gap-2">
      <div className={cn('truncate text-base font-semibold text-muted-foreground')}>
        {item?.title}
      </div>
      {label && (
        <span className={clsx(styles.badge, sIcon.className)}>
          <span
            className={clsx('anticon', result?.status === 'running' && 'motion-safe:animate-spin')}
            data-slot="verify-result-status-icon"
            role="img"
          >
            <sIcon.icon fill={'transparent'} height={16} size={16} width={16} />
          </span>
          {label}
        </span>
      )}
    </div>
  );
};

export default Title;
