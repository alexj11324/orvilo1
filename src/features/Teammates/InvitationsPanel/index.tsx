'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { Ban, Mail } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import { Badge as Tag } from '@/components/reui/badge';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

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
  table: css`
    /* Fixed columns + gaps floor at ~640px; below that the wrapper scrolls
       horizontally instead of crushing cells or overflowing the page. */
    min-width: 640px;
  `,
  tableScroll: css`
    overflow-x: auto;
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
        icon: <Mail />,
        key: 'resend',
        label: t('workspaceSetting.invitations.resend'),
        onClick: () => void resendInvitation(invitation.id),
      },
      {
        danger: true,
        icon: <Ban />,
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
        <Tag style={{ color: STATUS_COLOR[invitation.status] ?? 'default' }}>
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
          <SidebarDropdownMenu items={menuItems}>
            <Button size="sm" variant="ghost">
              ⋯
            </Button>
          </SidebarDropdownMenu>
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
      <div className="flex flex-col gap-4" style={{ paddingBlock: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex items-center gap-2.5" key={i}>
            <Skeleton className="h-3" style={{ marginBottom: 0, width: '45%' }} />
            <Skeleton className="h-3" style={{ marginBottom: 0, width: '20%' }} />
            <Skeleton className="h-3" style={{ marginBottom: 0, width: '20%' }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('workspaceSetting.invitations.loadFailed')}</AlertTitle>
        <AlertAction>
          {
            <Button size="sm" onClick={() => void mutate()}>
              {t('retry', { ns: 'common' })}
            </Button>
          }
        </AlertAction>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={styles.tableScroll}>
        <div className={styles.table}>
          <div className={styles.row}>
            <span className={styles.headerCell}>
              {t('workspaceSetting.invitations.columnEmail')}
            </span>
            <span className={styles.headerCell}>
              {t('workspaceSetting.invitations.columnStatus')}
            </span>
            <span className={styles.headerCell}>
              {t('workspaceSetting.invitations.columnLastSent')}
            </span>
            <span className={styles.headerCell}>
              {t('workspaceSetting.invitations.columnExpires')}
            </span>
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
        </div>
      </div>
      {invitations.length === 0 && (
        <Empty style={{ paddingBlock: 32 }}>
          <EmptyHeader>
            <EmptyDescription>{t('workspaceSetting.invitations.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
});

InvitationsPanel.displayName = 'InvitationsPanel';

export default InvitationsPanel;
