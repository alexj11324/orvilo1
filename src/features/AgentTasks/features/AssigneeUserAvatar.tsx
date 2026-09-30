import { memo } from 'react';

import Avatar from '@/components/Avatar';

import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import { SimpleTooltip } from './SimpleTooltip';
import { UnassignedAssigneeIcon } from './UnassignedAssigneeIcon';

interface AssigneeUserAvatarProps {
  size?: number;
  tooltip?: boolean;
  userId?: string | null;
}

/** Human-assignee twin of `AssigneeAvatar` (which renders agent assignees). */
const AssigneeUserAvatar = memo<AssigneeUserAvatarProps>(({ userId, size = 18, tooltip }) => {
  const displayMeta = useUserDisplayMeta(userId);

  if (!displayMeta) {
    // Unknown / unassigned humans draw the same dashed-circle + silhouette mark
    // every assignee surface shares.
    return <UnassignedAssigneeIcon kind={'human'} size={size} />;
  }

  const avatar = (
    <Avatar
      avatar={displayMeta.avatar || undefined}
      name={displayMeta.title || undefined}
      shape={'circle'}
      size={size}
      title={displayMeta.title || undefined}
      variant={'outlined'}
    />
  );

  return tooltip ? <SimpleTooltip title={displayMeta.title}>{avatar}</SimpleTooltip> : avatar;
});

export default AssigneeUserAvatar;
