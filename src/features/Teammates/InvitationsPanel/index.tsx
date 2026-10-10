'use client';

import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
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

const styles = {
  email: 'overflow-hidden flex-1 text-sm leading-5.5 text-ellipsis whitespace-nowrap',
  headerCell: 'text-xs leading-5 font-medium text-foreground-tertiary uppercase tracking-normal',
  meta: 'text-xs leading-5 text-muted-foreground',
  row: 'grid grid-cols-[minmax(0,1fr)_120px_130px_110px_40px] gap-3 items-center py-2.5 px-1 border-b border-divider',
  table: 'min-w-160',
  tableScroll: 'overflow-x-auto',
};

const STATUS_CLASSES: Record<string, string> = {
  accepted: 'border-success-border bg-success-wash text-success-text',
  expired: 'border-divider bg-fill-quaternary text-muted-foreground',
  pending: 'border-warning-border bg-warning-wash text-warning-text',
  revoked: 'border-destructive-border bg-destructive-wash text-destructive-text',
};

const STATUS_KEY = {
  accepted: 'workspaceSetting.invitations.status.accepted',
  expired: 'workspaceSetting.invitations.status.expired',
  pending: 'workspaceSetting.invitations.status.pending',
  revoked: 'workspaceSetting.invitations.status.revoked',
} as const satisfies Record<WorkspaceInvitationSummary['status'], string>;

const formatDate = (value: Date | string | null | undefined): string =>
  formatAbsoluteDateTime(value) || '—';

interface InvitationRowProps {
  canManage: boolean;
  invitation: WorkspaceInvitationSummary;
}

const InvitationRow = memo<InvitationRowProps>(({ canManage, invitation }) => {
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
        <Tag
          className={cn('py-0 text-xs leading-5', STATUS_CLASSES[invitation.status])}
          size="xl"
          variant="secondary"
        >
          {t(STATUS_KEY[invitation.status])}
        </Tag>
      </div>
      <div className={styles.meta}>
        {t('workspaceSetting.invitations.lastSent', {
          date: formatDate(invitation.lastSentAt ?? invitation.createdAt),
        })}
      </div>
      <div className={styles.meta}>{formatDate(invitation.expiresAt)}</div>
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
  const { t } = useTranslation('setting');
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
      <div className="flex flex-col gap-4 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex items-center gap-2.5" key={i}>
            <Skeleton className="mb-0 h-3 w-9/20" />
            <Skeleton className="mb-0 h-3 w-1/5" />
            <Skeleton className="mb-0 h-3 w-1/5" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert className="rounded-(--radius-card) text-sm leading-5.5" variant="destructive">
        <AlertTitle className="line-clamp-none text-sm leading-5.5 tracking-normal">
          {t('workspaceSetting.invitations.loadFailed')}
        </AlertTitle>
        <AlertAction>
          {
            <Button size="lg" onClick={() => void mutate()}>
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
            />
          ))}
        </div>
      </div>
      {invitations.length === 0 && (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyDescription className="text-sm leading-5.5">
              {t('workspaceSetting.invitations.empty')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
});

InvitationsPanel.displayName = 'InvitationsPanel';

export default InvitationsPanel;
