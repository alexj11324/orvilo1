'use client';

import { DropdownMenu, Empty, Flexbox, Icon } from '@lobehub/ui';
import {
  Alert,
  Button,
  confirmModal,
  createModal,
  Select,
  SkeletonText,
  Tag,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Crown, PauseCircle, PlayCircle, Repeat, UserMinus } from 'lucide-react';
import type { ReactNode } from 'react';
import { lazy, memo, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import Avatar from '@/components/Avatar';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import type { WorkspaceMemberSummary } from '../api/contract';
import {
  usePendingOwnershipTransferQuery,
  useTeammateActions,
  useWorkspaceMembersQuery,
} from '../api/hooks';
import {
  canManageMember,
  canRequestOwnershipTransfer,
  changeableRolesFor,
  type MemberStatus,
  memberStatus,
} from '../api/roleCapabilities';

const RemoveMemberContent = lazy(() => import('./RemoveMemberContent'));

const styles = createStaticStyles(({ css }) => ({
  email: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
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
  list: css`
    display: flex;
    flex-direction: column;
  `,
  memberCell: css`
    display: flex;
    flex: 1;
    gap: 10px;
    align-items: center;

    min-width: 0;
  `,
  name: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  numeric: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  row: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px 76px 76px 86px 110px 110px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  table: css`
    /* Fixed columns + gaps floor at ~840px; below that the wrapper scrolls
       horizontally instead of crushing cells or overflowing the page. */
    min-width: 840px;
  `,
  transferBanner: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorWarningBorder};
    border-radius: 8px;

    background: ${cssVar.colorWarningBg};
  `,
  transferBannerText: css`
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  tableScroll: css`
    overflow-x: auto;
  `,
}));

const displayName = (member: WorkspaceMemberSummary): string =>
  member.user?.fullName || member.user?.username || member.user?.email || member.userId;

const ROLE_TAG_COLOR: Record<string, string> = {
  admin: 'purple',
  member: 'blue',
  owner: 'gold',
  viewer: 'default',
};

const STATUS_LABEL = {
  active: 'workspaceSetting.members.status.active',
  removed: 'workspaceSetting.members.status.removed',
  suspended: 'workspaceSetting.members.status.suspended',
} as const satisfies Record<MemberStatus, string>;

interface MemberRowProps {
  callerRole: string | null;
  callerUserId?: string;
  member: WorkspaceMemberSummary;
  onRemove: (member: WorkspaceMemberSummary) => void;
  onTransfer: (member: WorkspaceMemberSummary) => void;
  transferEligible: boolean;
}

const MemberRow = memo<MemberRowProps>(
  ({ callerRole, callerUserId, member, onRemove, onTransfer, transferEligible }) => {
    const { t } = useTranslation('setting');
    const { changeRole, mutating, resume, suspend } = useTeammateActions();

    const status = memberStatus(member);
    const manageable = canManageMember(callerRole, member, callerUserId);
    const roleChoices = changeableRolesFor(callerRole, member.role);
    const joinedAt = member.joinedAt ? new Date(member.joinedAt) : null;

    const menuItems = useMemo(() => {
      // Ownership transfer is reachable even when ordinary member management
      // is not — a legacy co-owner row is a valid transfer target.
      if (!manageable && !transferEligible) return [];
      const items: {
        danger?: boolean;
        icon: ReactNode;
        key: string;
        label: string;
        onClick: () => void;
      }[] = [];
      if (transferEligible) {
        items.push({
          icon: <Icon icon={Repeat} />,
          key: 'transfer',
          label: t('workspaceSetting.members.transferOwnership'),
          onClick: () => onTransfer(member),
        });
      }
      if (manageable && status === 'active') {
        items.push({
          icon: <Icon icon={PauseCircle} />,
          key: 'suspend',
          label: t('workspaceSetting.members.suspend'),
          onClick: () => void suspend(member.userId),
        });
      }
      if (manageable && status === 'suspended') {
        items.push({
          icon: <Icon icon={PlayCircle} />,
          key: 'resume',
          label: t('workspaceSetting.members.resume'),
          onClick: () => void resume(member.userId),
        });
      }
      if (manageable) {
        items.push({
          danger: true,
          icon: <Icon icon={UserMinus} />,
          key: 'remove',
          label: t('workspaceSetting.members.remove'),
          onClick: () => onRemove(member),
        });
      }
      return items;
    }, [manageable, transferEligible, status, t, suspend, resume, member, onRemove, onTransfer]);

    return (
      <div className={styles.row}>
        <div className={styles.memberCell}>
          <Avatar
            avatar={member.user?.avatar}
            name={displayName(member)}
            size={32}
            title={member.user?.email ?? displayName(member)}
          />
          <Flexbox flex={1} gap={0} style={{ minWidth: 0 }}>
            <span className={styles.name}>
              {displayName(member)}
              {member.role === 'owner' && (
                <Icon
                  icon={Crown}
                  size={12}
                  style={{ color: cssVar.colorWarning, marginInlineStart: 6 }}
                />
              )}
            </span>
            {member.user?.email && <span className={styles.email}>{member.user.email}</span>}
          </Flexbox>
        </div>

        <div>
          {manageable && roleChoices.length > 0 ? (
            <Select
              disabled={mutating}
              size="small"
              style={{ width: 128 }}
              value={member.role}
              // Current role first so the select renders its label, not the raw value.
              options={[member.role, ...roleChoices].map((role) => ({
                label: t(`workspaceSetting.members.role.${role}`),
                value: role,
              }))}
              onChange={(value) =>
                void changeRole(member.userId, value as typeof member.role, member.authzVersion)
              }
            />
          ) : (
            <Tag color={ROLE_TAG_COLOR[member.role] ?? 'default'}>
              {t(`workspaceSetting.members.role.${member.role}`, {
                defaultValue: member.role,
              })}
            </Tag>
          )}
        </div>

        <div className={styles.numeric}>{member.projectCount ?? 0}</div>
        <div className={styles.numeric}>{member.openAssignedCount ?? 0}</div>
        <div className={styles.numeric}>{member.openReviewingCount ?? 0}</div>

        <div>
          <Tag
            color={status === 'active' ? 'green' : status === 'suspended' ? 'orange' : 'default'}
          >
            {t(STATUS_LABEL[status])}
          </Tag>
        </div>

        <div className={styles.numeric}>{joinedAt ? joinedAt.toLocaleDateString() : '—'}</div>

        <div>
          {menuItems.length > 0 && (
            <DropdownMenu items={menuItems}>
              <Button disabled={mutating} size="small" type="text">
                ⋯
              </Button>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  },
);

MemberRow.displayName = 'MemberRow';

/**
 * Workspace member roster with role changes, suspend/resume and removal —
 * every row gated by the caller's role ceiling so the UI never offers an
 * action the server would reject. Pending invitations live in the
 * InvitationsPanel tab; removed rows are filtered out of this roster.
 */
export const MembersPanel = memo(() => {
  const { t } = useTranslation('setting');
  const capabilities = useWorkspaceCapabilities();
  const callerUserId = useUserStore(userProfileSelectors.userId);
  const { data: members, error, isLoading, mutate } = useWorkspaceMembersQuery();
  const {
    data: pendingTransfer,
    error: transferError,
    mutate: refreshTransfer,
  } = usePendingOwnershipTransferQuery();
  const { cancelOwnershipTransfer, mutating, requestOwnershipTransfer, respondOwnershipTransfer } =
    useTeammateActions();

  const openRemoveModal = useCallback(
    (member: WorkspaceMemberSummary) => {
      createModal({
        content: (
          <Suspense fallback={null}>
            <RemoveMemberContent
              candidates={members ?? []}
              target={{ displayName: displayName(member), member }}
            />
          </Suspense>
        ),
        footer: null,
        styles: { content: { padding: 0 } },
        title: t('workspaceSetting.members.removeTitle', { name: displayName(member) }),
        width: 460,
      });
    },
    [members, t],
  );

  const openTransferConfirm = useCallback(
    (member: WorkspaceMemberSummary) => {
      const name = displayName(member);
      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('workspaceSetting.members.transferConfirmContent', { name }),
        okText: t('workspaceSetting.members.transferOwnership'),
        onOk: async () => {
          const ok = await requestOwnershipTransfer(member.userId);
          if (ok) toast.success(t('workspaceSetting.members.transferRequested'));
        },
        title: t('workspaceSetting.members.transferConfirmTitle', { name }),
      });
    },
    [requestOwnershipTransfer, t],
  );

  const handleTransferRespond = useCallback(
    async (accept: boolean) => {
      const ok = await respondOwnershipTransfer(accept);
      if (ok) {
        toast.success(
          t(
            accept
              ? 'workspaceSetting.members.transferAccepted'
              : 'workspaceSetting.members.transferDeclined',
          ),
        );
      }
    },
    [respondOwnershipTransfer, t],
  );

  const handleTransferCancel = useCallback(async () => {
    const ok = await cancelOwnershipTransfer();
    if (ok) toast.success(t('workspaceSetting.members.transferCancelled'));
  }, [cancelOwnershipTransfer, t]);

  if (isLoading) {
    return (
      <Flexbox gap={16} style={{ paddingBlock: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Flexbox horizontal align="center" gap={10} key={i}>
            <SkeletonText style={{ marginBottom: 0, width: '40%' }} />
            <SkeletonText style={{ marginBottom: 0, width: '25%' }} />
            <SkeletonText style={{ marginBottom: 0, width: '20%' }} />
          </Flexbox>
        ))}
      </Flexbox>
    );
  }
  if (error) {
    return (
      <Alert
        title={t('workspaceSetting.members.loadFailed')}
        type="error"
        action={
          <Button size="small" onClick={() => void mutate()}>
            {t('retry', { ns: 'common' })}
          </Button>
        }
      />
    );
  }

  const rows = (members ?? []).filter((member) => !member.deletedAt);

  // A pending hand-off only exists between the owner and one invitee —
  // `pendingTransfer` is null for everyone else, so the banner is private
  // to its parties by construction.
  const isTransferInitiator =
    !!pendingTransfer && pendingTransfer.transfer.fromUserId === callerUserId;
  const isTransferRecipient =
    !!pendingTransfer && pendingTransfer.transfer.toUserId === callerUserId;
  const counterpartName = isTransferInitiator
    ? (pendingTransfer?.toUser?.fullName ??
      pendingTransfer?.toUser?.username ??
      pendingTransfer?.transfer.toUserId)
    : (pendingTransfer?.fromUser?.fullName ??
      pendingTransfer?.fromUser?.username ??
      pendingTransfer?.transfer.fromUserId);

  return (
    <Flexbox gap={8}>
      {transferError && (
        // A failed pending-transfer lookup is NOT "no transfer" — hiding it
        // would let the owner open a second request and leave the recipient
        // unable to see or answer the pending one.
        <Alert
          title={t('workspaceSetting.members.transferLoadFailed')}
          type="warning"
          action={
            <Button size="small" onClick={() => void refreshTransfer()}>
              {t('retry', { ns: 'common' })}
            </Button>
          }
        />
      )}
      {pendingTransfer && (isTransferInitiator || isTransferRecipient) && (
        <div className={styles.transferBanner}>
          <span className={styles.transferBannerText}>
            {t(
              isTransferRecipient
                ? 'workspaceSetting.members.transferBannerIncoming'
                : 'workspaceSetting.members.transferBannerOutgoing',
              { name: counterpartName },
            )}
          </span>
          <Flexbox horizontal gap={8}>
            {isTransferRecipient && (
              <>
                <Button
                  disabled={mutating}
                  size="small"
                  type="primary"
                  onClick={() => void handleTransferRespond(true)}
                >
                  {t('workspaceSetting.members.transferAccept')}
                </Button>
                <Button
                  disabled={mutating}
                  size="small"
                  onClick={() => void handleTransferRespond(false)}
                >
                  {t('workspaceSetting.members.transferDecline')}
                </Button>
              </>
            )}
            {isTransferInitiator && (
              <Button disabled={mutating} size="small" onClick={() => void handleTransferCancel()}>
                {t('workspaceSetting.members.transferCancel')}
              </Button>
            )}
          </Flexbox>
        </div>
      )}
      <div className={styles.tableScroll}>
        <div className={styles.table}>
          <div className={styles.row}>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnMember')}</span>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnRole')}</span>
            <span className={styles.headerCell}>
              {t('workspaceSetting.members.columnProjects')}
            </span>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnTasks')}</span>
            <span className={styles.headerCell}>
              {t('workspaceSetting.members.columnReviewing')}
            </span>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnStatus')}</span>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnJoined')}</span>
            <span />
          </div>
          <div className={styles.list}>
            {rows.map((member) => (
              <MemberRow
                callerRole={capabilities.role}
                callerUserId={callerUserId}
                key={member.userId}
                member={member}
                transferEligible={canRequestOwnershipTransfer(
                  capabilities.role,
                  member,
                  callerUserId,
                  // An unknown pending state (lookup failed) is treated as
                  // possibly-pending so the menu can't offer a request the
                  // server would reject with a duplicate-pending conflict.
                  !!pendingTransfer || !!transferError,
                )}
                onRemove={openRemoveModal}
                onTransfer={openTransferConfirm}
              />
            ))}
          </div>
        </div>
      </div>
      {rows.length === 0 && (
        <Empty description={t('workspaceSetting.members.empty')} style={{ paddingBlock: 32 }} />
      )}
    </Flexbox>
  );
});

MembersPanel.displayName = 'MembersPanel';

export default MembersPanel;
