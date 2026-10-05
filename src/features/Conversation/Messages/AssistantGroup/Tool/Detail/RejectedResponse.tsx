import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { AlertTriangle, CornerUpRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveRejectedCopyKey } from './resolveRejectedCopyKey';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-block: 8px;
    padding-inline: 6px;
  `,
  reason: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    font-size: 14px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface RejectedResponseProps {
  /** Distinguishes question skips from other skipped interactions in the copy. */
  apiName?: string;
  reason?: string;
  /**
   * The user skipped the interaction (e.g. an AskUserQuestion) instead of
   * rejecting the tool call — render a neutral note, not a warning.
   */
  skipped?: boolean;
}

const RejectedResponse = memo<RejectedResponseProps>(({ apiName, reason, skipped }) => {
  const { t } = useTranslation('chat');

  const copyKey = resolveRejectedCopyKey({ apiName, reason, skipped });

  return (
    <div className={cn('flex flex-col gap-2', styles.container)}>
      <div className="flex items-center gap-2">
        {skipped ? (
          <CornerUpRight color={cssVar.colorTextTertiary} size={16} />
        ) : (
          <AlertTriangle color={cssVar.colorWarning} size={16} />
        )}
        <div className={styles.title}>{t(copyKey, { reason })}</div>
      </div>
    </div>
  );
});

export default RejectedResponse;
