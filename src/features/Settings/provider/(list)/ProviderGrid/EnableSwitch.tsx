import { type FC } from 'react';

import InstantSwitch from '@/components/InstantSwitch';
import { usePermission } from '@/hooks/usePermission';
import { useAiInfraStore } from '@/store/aiInfra';

interface SwitchProps {
  Component?: FC<{ enabled: boolean; id: string }>;
  enabled: boolean;
  id: string;
  /** Accessible name of the switch; the visible card title names it for screen readers. */
  label?: string;
}

const Switch = ({ id, Component, enabled, label }: SwitchProps) => {
  const { allowed: canManageProvider } = usePermission('manage_provider_key');
  const [toggleProviderEnabled] = useAiInfraStore((s) => [s.toggleProviderEnabled]);

  // slot for cloud
  if (Component) return <Component enabled={enabled} id={id} />;

  return (
    <InstantSwitch
      aria-label={label}
      disabled={!canManageProvider}
      enabled={enabled}
      onChange={async (checked) => {
        if (!canManageProvider) return;
        await toggleProviderEnabled(id, checked);
      }}
    />
  );
};

export default Switch;
