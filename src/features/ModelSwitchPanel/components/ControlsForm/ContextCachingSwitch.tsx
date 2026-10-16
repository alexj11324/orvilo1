import { memo } from 'react';

import { Switch } from '@/components/ui/switch';

interface ContextCachingSwitchProps {
  disabled?: boolean;
  onChange?: (value: boolean) => void;
  value?: boolean;
}

const ContextCachingSwitch = memo<ContextCachingSwitchProps>(({ disabled, value, onChange }) => {
  return (
    <Switch
      checked={!value}
      disabled={disabled}
      size={'sm'}
      onCheckedChange={(checked) => {
        onChange?.(!checked);
      }}
    />
  );
});

export default ContextCachingSwitch;
