import { type ContextMenuItem, Icon, type MenuInfo } from '@lobehub/ui';
import { canWorkspaceRoleBeTaskAssignee } from '@orvilo/const/rbac';
import { cssVar } from 'antd-style';
import { UserRoundX } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useFetchWorkspaceMembers } from '@/business/client/hooks/useFetchWorkspaceMembers';
import {
  useWorkspaceMembers,
  type WorkspaceMemberWithProfile,
} from '@/business/client/hooks/useWorkspaceMembers';
import Avatar from '@/components/Avatar';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { hasWorkspaceMemberDirectory } from '../shared/memberAssigneeMode';
import { partitionSelfMember } from './assigneeMemberOptions';
import { renderMenuCheck } from './menuExtra';

type Member = WorkspaceMemberWithProfile;

const memberName = (member: Member) =>
  member.user?.fullName?.trim() ||
  member.user?.username?.trim() ||
  member.user?.email?.trim() ||
  member.userId;

export interface AssigneeMenuSelect {
  (userId: string | null, member?: Member): void;
}

/**
 * The flat "Assignee" member list Linear exposes inside its issue context menu
 * and its bulk-action menu — one builder so the row context menu and the
 * My-issues Actions menu stay identical. It mirrors `AssigneeMemberSelector`'s
 * roster rules (assignable roles only, private tasks restricted to the
 * creator, self pinned under Unassigned) as plain menu items — `ContextMenuItem`
 * and `DropdownItem` are the same `BaseMenuItemType`, so the result feeds both.
 */
export const useAssigneeMenuItems = (
  currentUserId: string | null | undefined,
  onSelect: AssigneeMenuSelect,
  options?: {
    /** Private tasks only ever offer their creator — same rule as the selector. */
    creatorId?: string | null;
    disabled?: boolean;
    visibility?: 'private' | 'public' | null;
  },
): ContextMenuItem[] => {
  const { t } = useTranslation('chat');
  const activeWorkspaceId = useActiveWorkspaceId();
  // The context menu may be the only member-picker consumer on the surface —
  // mount the fetch hook so the roster resolves instead of reading the empty
  // snapshot.
  useFetchWorkspaceMembers();
  const allMembers = useWorkspaceMembers();
  const selfUserId = useUserStore(userProfileSelectors.userId);
  const creatorId = options?.creatorId ?? selfUserId;
  const disabled = Boolean(options?.disabled);
  const visibility = options?.visibility;

  return useMemo(() => {
    const assignable = hasWorkspaceMemberDirectory(activeWorkspaceId)
      ? allMembers.filter((member) => canWorkspaceRoleBeTaskAssignee(member.role))
      : [];
    const visible =
      visibility === 'private'
        ? assignable.filter((member) => member.userId === creatorId)
        : assignable;
    const { others, self } = partitionSelfMember(visible, selfUserId);

    const memberItem = (member: Member): ContextMenuItem => ({
      disabled,
      extra: renderMenuCheck(member.userId === currentUserId),
      icon: (
        <Avatar
          avatar={member.user?.avatar || undefined}
          name={memberName(member)}
          shape={'circle'}
          size={18}
        />
      ),
      key: `assignee:${member.userId}`,
      label: memberName(member),
      onClick: ({ domEvent }: MenuInfo) => {
        domEvent.stopPropagation();
        onSelect(member.userId, member);
      },
    });

    return [
      {
        disabled,
        extra: renderMenuCheck(!currentUserId),
        icon: <Icon color={cssVar.colorTextDescription} icon={UserRoundX} size={16} />,
        key: 'assignee:unassigned',
        label: t('taskList.unassigned'),
        onClick: ({ domEvent }: MenuInfo) => {
          domEvent.stopPropagation();
          onSelect(null);
        },
      },
      ...(self ? [memberItem(self)] : []),
      ...others.map(memberItem),
    ];
  }, [
    activeWorkspaceId,
    allMembers,
    creatorId,
    currentUserId,
    disabled,
    onSelect,
    selfUserId,
    t,
    visibility,
  ]);
};
