'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';

const styles = {
  checked: 'border-primary bg-primary text-card',
  circle:
    'flex-none [inline-size:20px] [block-size:20px] border-[1.5px] border-border rounded-[50%] transition-[background-color,border-color] duration-150 ease-[var(--ant-motion-ease-in-out)]',
};

interface SelectCircleProps {
  checked?: boolean;
  className?: string;
}

/**
 * WeChat-style round selection indicator: a hollow circle that fills with the
 * primary color and a check when selected. Replaces the square antd Checkbox in
 * multi-select rows.
 */
const SelectCircle = memo<SelectCircleProps>(({ checked, className }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center',
      cn(styles.circle, checked && styles.checked, className),
    )}
  >
    {checked && <Check size={14} />}
  </div>
));

SelectCircle.displayName = 'SelectCircle';

export default SelectCircle;
