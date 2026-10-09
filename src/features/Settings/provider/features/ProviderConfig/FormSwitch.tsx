'use client';

import { memo } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

interface FormSwitchProps {
  'aria-label'?: string;
  /** Bound by `Form.Item` through `valuePropName: 'checked'`. */
  'checked'?: boolean;
  /** Shows a spinner next to the switch while the saved value is being written. */
  'loading'?: boolean;
  'onChange'?: (checked: boolean) => void;
}

/** Form-bound switch: the local `Switch` speaks `onCheckedChange`, antd forms speak `onChange`. */
const FormSwitch = memo<FormSwitchProps>(
  ({ 'aria-label': ariaLabel, checked, loading, onChange }) => (
    <span className="inline-flex items-center gap-2">
      {loading && <Spinner className="size-3.5 text-muted-foreground" />}
      <Switch
        aria-label={ariaLabel}
        checked={!!checked}
        onCheckedChange={(next) => onChange?.(next)}
      />
    </span>
  ),
);

FormSwitch.displayName = 'FormSwitch';

export default FormSwitch;
