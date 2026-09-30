import { memo, useState } from 'react';

import { Switch } from '@/components/ui/switch';

interface InstantSwitchProps {
  disabled?: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
  size?: 'default' | 'sm';
}

const InstantSwitch = memo<InstantSwitchProps>(({ disabled, enabled, onChange, size }) => {
  const [value, setValue] = useState(enabled);
  const [loading, setLoading] = useState(false);
  return (
    <Switch
      checked={value}
      disabled={disabled || loading}
      size={size}
      onCheckedChange={async (enabled) => {
        setLoading(true);
        setValue(enabled);
        await onChange(enabled);
        setLoading(false);
      }}
    />
  );
});

export default InstantSwitch;
