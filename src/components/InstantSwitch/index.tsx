import { memo, useState } from 'react';

import { Switch } from '@/components/ui/switch';

interface InstantSwitchProps {
  'aria-label'?: string;
  'disabled'?: boolean;
  'enabled': boolean;
  'onChange': (enabled: boolean) => Promise<void>;
  'size'?: 'default' | 'sm';
}

const InstantSwitch = memo<InstantSwitchProps>(
  ({ 'aria-label': ariaLabel, disabled, enabled, onChange, size }) => {
    const [value, setValue] = useState(enabled);
    const [loading, setLoading] = useState(false);
    return (
      <Switch
        aria-label={ariaLabel}
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
  },
);

export default InstantSwitch;
