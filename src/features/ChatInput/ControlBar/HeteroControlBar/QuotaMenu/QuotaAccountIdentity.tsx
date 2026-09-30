'use client';

import type { ClaudeCodeQuotaSnapshot } from '@orvilo/electron-client-ipc';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CalendarDaysIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
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
 * is no account pool to manage or switch. An identity-less snapshot renders
 * 'unknown' — the panel must admit it cannot name the account rather than
 * leaving a borrowed name on screen.
 */
const QuotaAccountIdentity = memo<{
  placement?: 'top' | 'bottom';
  snapshot: ClaudeCodeQuotaSnapshot;
}>(({ snapshot, placement = 'top' }) => {
  const { t } = useTranslation('chat');
  const identity = snapshot.identity;

  const label = identity
    ? identity.displayName || identity.email || t('heteroAgent.claudeQuota.accounts')
    : t('heteroAgent.claudeQuota.unknownIdentity');

  return (
    <div
      className={cx(
        'flex flex-row items-center gap-2 justify-between',
        placement === 'top' ? styles.top : styles.bottom,
      )}
    >
      <div className="flex flex-row items-center gap-1.5" style={{ minWidth: 0 }}>
        <div className="truncate text-muted-foreground" style={{ fontSize: 12 }}>
          {label}
        </div>
        {identity?.planTier && (
          <div className="text-muted-foreground" style={{ flex: 'none', fontSize: 12 }}>
            {identity.planTier}
          </div>
        )}
      </div>
      {identity?.externalAccountId && (
        <ActionIcon
          icon={CalendarDaysIcon}
          size={'small'}
          style={{ flex: 'none' }}
          title={t('heteroAgent.claudeQuota.calendar.entry')}
          onClick={() => openQuotaCalendarModal({ externalAccountId: identity.externalAccountId })}
        />
      )}
    </div>
  );
});

QuotaAccountIdentity.displayName = 'QuotaAccountIdentity';

export default QuotaAccountIdentity;
