import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';

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

    const avatar = (
      <span
        aria-label={`${t('cmdk.context.agent')}: ${displayMeta.title}`}
        className="inline-flex shrink-0"
        role="img"
      >
        <AgentRuntimeIcon size={size} type={displayMeta.runtimeType} />
      </span>
    );

    return tooltip ? <SimpleTooltip title={displayMeta.title}>{avatar}</SimpleTooltip> : avatar;
  },
);

export default AssigneeAvatar;
