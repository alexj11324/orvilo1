import { Tooltip } from '@lobehub/ui';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
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

  return tooltip ? <Tooltip title={displayMeta.title}>{avatar}</Tooltip> : avatar;
});

export default AssigneeUserAvatar;
