'use client';

import { DropdownMenu, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Alert, Button, createModal, Select, SkeletonText, Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Crown, PauseCircle, PlayCircle, UserMinus } from 'lucide-react';
import type { ReactNode } from 'react';
import { lazy, memo, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import Avatar from '@/components/Avatar';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import type { WorkspaceMemberSummary } from '../api/contract';
import { useTeammateActions, useWorkspaceMembersQuery } from '../api/hooks';
import {
  canManageMember,
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
  row: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px 110px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  table: css`
    /* Fixed columns + gaps floor at ~500px; below that the wrapper scrolls
       horizontally instead of crushing cells or overflowing the page. */
    min-width: 500px;
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
}

const MemberRow = memo<MemberRowProps>(({ callerRole, callerUserId, member, onRemove }) => {
  const { t } = useTranslation('setting');
  const { changeRole, mutating, resume, suspend } = useTeammateActions();

  const status = memberStatus(member);
  const manageable = canManageMember(callerRole, member, callerUserId);
  const roleChoices = changeableRolesFor(callerRole, member.role);

  const menuItems = useMemo(() => {
    if (!manageable) return [];
    const items: {
      danger?: boolean;
      icon: ReactNode;
      key: string;
      label: string;
      onClick: () => void;
    }[] = [];
    if (status === 'active') {
      items.push({
        icon: <Icon icon={PauseCircle} />,
        key: 'suspend',
        label: t('workspaceSetting.members.suspend'),
        onClick: () => void suspend(member.userId),
      });
    }
    if (status === 'suspended') {
      items.push({
        icon: <Icon icon={PlayCircle} />,
        key: 'resume',
        label: t('workspaceSetting.members.resume'),
        onClick: () => void resume(member.userId),
      });
    }
    items.push({
      danger: true,
      icon: <Icon icon={UserMinus} />,
      key: 'remove',
      label: t('workspaceSetting.members.remove'),
      onClick: () => onRemove(member),
    });
    return items;
  }, [manageable, status, t, suspend, resume, member, onRemove]);

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

      <div>
        <Tag color={status === 'active' ? 'green' : status === 'suspended' ? 'orange' : 'default'}>
          {t(STATUS_LABEL[status])}
        </Tag>
      </div>

      <div>
        {manageable && menuItems.length > 0 && (
          <DropdownMenu items={menuItems}>
            <Button disabled={mutating} size="small" type="text">
              ⋯
            </Button>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

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

  if (isLoading) {
    return (
      <Flexbox gap={16} style={{ paddingBlock: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Flexbox align="center" gap={10} horizontal key={i}>
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

  return (
    <Flexbox gap={8}>
      <div className={styles.tableScroll}>
        <div className={styles.table}>
          <div className={styles.row}>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnMember')}</span>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnRole')}</span>
            <span className={styles.headerCell}>{t('workspaceSetting.members.columnStatus')}</span>
            <span />
          </div>
          <div className={styles.list}>
            {rows.map((member) => (
              <MemberRow
                callerRole={capabilities.role}
                callerUserId={callerUserId}
                key={member.userId}
                member={member}
                onRemove={openRemoveModal}
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
