'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import type { ClaudeCodeQuotaSnapshot } from '@orvilo/electron-client-ipc';
import { createStaticStyles, cssVar } from 'antd-style';
import { CalendarDaysIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { openQuotaCalendarModal } from '@/features/AgentQuotaCalendar';

const styles = createStaticStyles(({ css }) => ({
  // Divider faces the quota windows: below when on top, above when it trails.
  bottom: css`
    padding-block-start: 8px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  top: css`
    padding-block-end: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

/**
 * Read-only account line in the quota panel: which provider identity these
 * quota numbers belong to, plus the calendar entry. Observation only — there
 * is no account pool to manage or switch.
 */
const QuotaAccountIdentity = memo<{
  placement?: 'top' | 'bottom';
  snapshot: ClaudeCodeQuotaSnapshot;
}>(({ snapshot, placement = 'top' }) => {
  const { t } = useTranslation('chat');
  const identity = snapshot.identity;

  if (!identity) return null;

  return (
    <Flexbox
      horizontal
      align={'center'}
      className={placement === 'top' ? styles.top : styles.bottom}
      gap={8}
      justify={'space-between'}
    >
      <Flexbox horizontal align={'center'} gap={6} style={{ minWidth: 0 }}>
        <Text ellipsis style={{ fontSize: 12 }}>
          {identity.displayName || identity.email || t('heteroAgent.claudeQuota.accounts')}
        </Text>
        {identity.planTier && (
          <Text style={{ flex: 'none', fontSize: 12 }} type={'secondary'}>
            {identity.planTier}
          </Text>
        )}
      </Flexbox>
      <ActionIcon
        icon={CalendarDaysIcon}
        size={'small'}
        style={{ flex: 'none' }}
        title={t('heteroAgent.claudeQuota.calendar.entry')}
        onClick={() => openQuotaCalendarModal({ externalAccountId: identity.externalAccountId })}
      />
    </Flexbox>
  );
});

QuotaAccountIdentity.displayName = 'QuotaAccountIdentity';

export default QuotaAccountIdentity;
