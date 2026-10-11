import { cssVar } from 'antd-style';
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
): { bg: keyof typeof cssVar; icon: typeof CheckCircle2; text: keyof typeof cssVar } => {
  switch (status) {
    case 'passed': {
      return { bg: 'colorSuccessBg', icon: CheckCircle2, text: 'colorSuccessText' };
    }
    case 'running': {
      return { bg: 'colorInfoBg', icon: LoaderCircle, text: 'colorInfoText' };
    }
    case 'failed': {
      return { bg: 'colorErrorBg', icon: XCircle, text: 'colorErrorText' };
    }
    case 'skipped': {
      return { bg: 'colorFillTertiary', icon: CircleAlert, text: 'colorTextSecondary' };
    }
    default: {
      return { bg: 'colorFillTertiary', icon: Circle, text: 'colorTextSecondary' };
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
    <div className="flex flex-row items-center gap-2" style={{ minWidth: 0 }}>
      <div className={cn('truncate text-base font-semibold text-muted-foreground')}>
        {item?.title}
      </div>
      {label && (
        <span
          className={styles.badge}
          style={{
            background: cssVar[sIcon.bg],
            color: cssVar[sIcon.text],
          }}
        >
          <span
            role="img"
            className={clsx(
              'anticon',
              result?.status === 'running' && 'animate-spin motion-reduce:animate-none',
            )}
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
