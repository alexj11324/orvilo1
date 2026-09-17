'use client';

import { DropdownMenu, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Alert, Button, SkeletonText, Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Ban, Mail } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';

import type { WorkspaceInvitationSummary } from '../api/contract';
import { useTeammateActions, useWorkspaceInvitationsQuery } from '../api/hooks';

const styles = createStaticStyles(({ css }) => ({
  email: css`
    overflow: hidden;
    flex: 1;

    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  headerCell: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  meta: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  row: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px 130px 110px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const STATUS_COLOR: Record<string, string> = {
  accepted: 'green',
  expired: 'default',
  pending: 'orange',
  revoked: 'red',
};

const STATUS_KEY = {
  accepted: 'workspaceSetting.invitations.status.accepted',
  expired: 'workspaceSetting.invitations.status.expired',
  pending: 'workspaceSetting.invitations.status.pending',
  revoked: 'workspaceSetting.invitations.status.revoked',
} as const satisfies Record<WorkspaceInvitationSummary['status'], string>;

const formatDate = (value: Date | string | null | undefined, locale: string): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
};

interface InvitationRowProps {
  canManage: boolean;
  invitation: WorkspaceInvitationSummary;
  locale: string;
}

const InvitationRow = memo<InvitationRowProps>(({ canManage, invitation, locale }) => {
  const { t } = useTranslation('setting');
  const { resendInvitation, revokeInvitation } = useTeammateActions();

  const pending = invitation.status === 'pending';
  const menuItems = useMemo(() => {
    if (!canManage || !pending) return [];
    return [
      {
        icon: <Icon icon={Mail} />,
        key: 'resend',
        label: t('workspaceSetting.invitations.resend'),
        onClick: () => void resendInvitation(invitation.id),
      },
      {
        danger: true,
        icon: <Icon icon={Ban} />,
        key: 'revoke',
        label: t('workspaceSetting.invitations.revoke'),
        onClick: () => void revokeInvitation(invitation.id),
      },
    ];
  }, [canManage, pending, t, resendInvitation, revokeInvitation, invitation.id]);

  return (
    <div className={styles.row}>
      <div>
        <div className={styles.email}>{invitation.email}</div>
        <div className={styles.meta}>
          {t('workspaceSetting.invitations.roleLine', {
            role: t(`workspaceSetting.members.role.${invitation.role}`, {
              defaultValue: invitation.role,
            }),
          })}
        </div>
      </div>
      <div>
        <Tag color={STATUS_COLOR[invitation.status] ?? 'default'}>
          {t(STATUS_KEY[invitation.status])}
        </Tag>
      </div>
      <div className={styles.meta}>
        {t('workspaceSetting.invitations.lastSent', {
          date: formatDate(invitation.lastSentAt ?? invitation.createdAt, locale),
        })}
      </div>
      <div className={styles.meta}>{formatDate(invitation.expiresAt, locale)}</div>
      <div>
        {menuItems.length > 0 && (
          <DropdownMenu items={menuItems}>
            <Button size="small" type="text">
              ⋯
            </Button>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

InvitationRow.displayName = 'InvitationRow';

/**
 * Invitation lifecycle table — pending/accepted/expired/revoked rows with
 * delivery recency and resend/revoke actions. Read-only once an invitation
 * leaves 'pending'.
 */
export const InvitationsPanel = memo(() => {
  const { t, i18n } = useTranslation('setting');
  const capabilities = useWorkspaceCapabilities();
  const { data, error, isLoading, mutate } = useWorkspaceInvitationsQuery();

  const invitations = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => {
        const pendingFirst = (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1);
        if (pendingFirst !== 0) return pendingFirst;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [data],
  );

  if (isLoading) {
    return (
      <Flexbox gap={16} style={{ paddingBlock: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Flexbox align="center" gap={10} horizontal key={i}>
            <SkeletonText style={{ marginBottom: 0, width: '45%' }} />
            <SkeletonText style={{ marginBottom: 0, width: '20%' }} />
            <SkeletonText style={{ marginBottom: 0, width: '20%' }} />
          </Flexbox>
        ))}
      </Flexbox>
    );
  }
  if (error) {
    return (
      <Alert
        title={t('workspaceSetting.invitations.loadFailed')}
        type="error"
        action={
          <Button size="small" onClick={() => void mutate()}>
            {t('retry', { ns: 'common' })}
          </Button>
        }
      />
    );
  }

  return (
    <Flexbox gap={8}>
      <div className={styles.row}>
        <span className={styles.headerCell}>{t('workspaceSetting.invitations.columnEmail')}</span>
        <span className={styles.headerCell}>{t('workspaceSetting.invitations.columnStatus')}</span>
        <span className={styles.headerCell}>
          {t('workspaceSetting.invitations.columnLastSent')}
        </span>
        <span className={styles.headerCell}>{t('workspaceSetting.invitations.columnExpires')}</span>
        <span />
      </div>
      {invitations.map((invitation) => (
        <InvitationRow
          canManage={capabilities.canInvite}
          invitation={invitation}
          key={invitation.id}
          locale={i18n.language}
        />
      ))}
      {invitations.length === 0 && (
        <Empty description={t('workspaceSetting.invitations.empty')} style={{ paddingBlock: 32 }} />
      )}
    </Flexbox>
  );
});

InvitationsPanel.displayName = 'InvitationsPanel';

export default InvitationsPanel;
