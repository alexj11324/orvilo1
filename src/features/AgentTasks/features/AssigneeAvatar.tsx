import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import Avatar from '@/components/Avatar';

import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { SimpleTooltip } from './SimpleTooltip';
import { UnassignedAssigneeIcon } from './UnassignedAssigneeIcon';

interface AssigneeAvatarProps {
  agentId?: string | null;
  fallbackToDefault?: boolean;
  size?: number;
  tooltip?: boolean;
}

const AssigneeAvatar = memo<AssigneeAvatarProps>(
  ({ agentId, fallbackToDefault, size = 18, tooltip }) => {
    const { t } = useTranslation('common');
    const displayMeta = useAgentDisplayMeta(agentId, { fallbackToDefault });

    if (!displayMeta) {
      return <UnassignedAssigneeIcon kind={'agent'} size={size} />;
    }

    // An agent this viewer cannot resolve has no known runtime; it keeps the
    // neutral default face instead of borrowing a brand it may not run on.
    const avatar = displayMeta.runtimeType ? (
      <span
        aria-label={`${t('cmdk.context.agent')}: ${displayMeta.title}`}
        className="inline-flex shrink-0"
        role="img"
      >
        <AgentRuntimeIcon size={size} type={displayMeta.runtimeType} />
      </span>
    ) : (
      <Avatar
        avatar={displayMeta.avatar}
        background={displayMeta.backgroundColor || cssVar.colorBgContainer}
        shape={'circle'}
        size={size}
        title={displayMeta.title}
        variant={'outlined'}
      />
    );

    return tooltip ? <SimpleTooltip title={displayMeta.title}>{avatar}</SimpleTooltip> : avatar;
  },
);

export default AssigneeAvatar;
