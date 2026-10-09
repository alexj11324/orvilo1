import { memo } from 'react';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';

const AgentAvatar = memo<{ type?: string | null }>(({ type }) => (
  <AgentRuntimeIcon size={22} type={type || 'orvilo'} />
));

export default AgentAvatar;
