import { CircleHelp } from 'lucide-react';
import { memo } from 'react';

import { getConnectableProvider } from '@/features/ConnectAgent/providers';

/** Runtime branding is independent of an agent's editable name and avatar. */
const AgentRuntimeIcon = memo<{ size?: number; type?: string | null }>(({ size = 24, type }) => {
  if (type === 'orvilo') {
    return (
      <img
        aria-hidden
        alt=""
        className="rounded-(--radius-card)"
        height={size}
        src="/app-icons/icon-512x512.png"
        style={{ flex: 'none' }}
        width={size}
      />
    );
  }
  const provider = getConnectableProvider(type as Parameters<typeof getConnectableProvider>[0]);
  if (!provider) return <CircleHelp aria-hidden size={size} />;
  return (
    <span aria-hidden style={{ flex: 'none' }}>
      <provider.brand.Avatar
        className="rounded-(--radius-card)"
        shape="square"
        size={size}
        style={{ borderRadius: undefined }}
      />
    </span>
  );
});

export default AgentRuntimeIcon;
