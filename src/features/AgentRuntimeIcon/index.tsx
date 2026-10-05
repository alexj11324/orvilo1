import { ProductLogo } from '@/components/Branding';
import { getConnectableProvider } from '@/features/ConnectAgent/providers';

interface AgentRuntimeIconProps {
  size: number;
  type?: string | null;
}

/** Runtime identity is independent of the editable name and legacy avatar. */
export const AgentRuntimeIcon = ({ size, type }: AgentRuntimeIconProps) => {
  const builtin = !type || type === 'orvilo';
  const provider = type ? getConnectableProvider(type) : undefined;
  if (!builtin && !provider) return null;

  return (
    <span aria-hidden="true" className="inline-flex shrink-0" title={provider?.title ?? 'Orvilo'}>
      {provider ? <provider.brand.Avatar size={size} /> : <ProductLogo size={size} type="mono" />}
    </span>
  );
};
