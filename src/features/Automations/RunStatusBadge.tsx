import { Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { normalizeRunStatus } from './shared';

const RUN_STYLE: Record<string, { background: string; color: string }> = {
  completed: { background: cssVar.colorSuccessBg, color: cssVar.colorSuccess },
  failed: { background: cssVar.colorErrorBg, color: cssVar.colorError },
  running: { background: cssVar.colorInfoBg, color: cssVar.colorInfo },
  skipped: { background: cssVar.colorFillTertiary, color: cssVar.colorTextSecondary },
};

interface RunStatusBadgeProps {
  /** Detail under the badge (e.g. failure reason) appended in secondary text. */
  hint?: string | null;
  /** Raw task_topics status string — normalized inside. */
  status?: string | null;
}

const RunStatusBadge = memo<RunStatusBadgeProps>(({ hint, status }) => {
  const { t } = useTranslation('automation');
  const normalized = normalizeRunStatus(status);
  const style = RUN_STYLE[normalized];
  return (
    <span
      title={hint ?? undefined}
      style={{
        alignItems: 'center',
        background: style.background,
        borderRadius: 6,
        color: style.color,
        display: 'inline-flex',
        fontSize: 12,
        gap: 4,
        lineHeight: 1.6,
        maxWidth: 280,
        paddingBlock: 1,
        paddingInline: 8,
      }}
    >
      <Text ellipsis color={'inherit'} fontSize={12}>
        {t(`run_status.${normalized}`)}
        {hint ? ` · ${hint}` : ''}
      </Text>
    </span>
  );
});

export default RunStatusBadge;
