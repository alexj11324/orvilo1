import { type LucideIcon } from 'lucide-react';
import { ChevronDownIcon } from 'lucide-react';
import { type ComponentProps } from 'react';
import { createElement, memo } from 'react';

import { Button } from '@/components/ui/button';

interface ActionIconWithChevronProps extends ComponentProps<typeof Button> {
  icon: LucideIcon;
}

const ActionIconWithChevron = memo<ActionIconWithChevronProps>(
  ({ icon, title, style, disabled, className, ...rest }) => {
    return (
      <Button
        {...rest}
        className={className}
        disabled={disabled}
        style={{ paddingInline: 4, ...style }}
        title={title}
        variant="ghost"
      >
        <div className="flex flex-row items-center gap-1">
          <span className="anticon" role="img">
            {createElement(icon, {
              className: 'size-[18px]',
              size: 18,
              width: 18,
              height: 18,
              color: 'var(--ant-color-icon)',
              fill: 'transparent',
            })}
          </span>
          <span className="anticon" role="img">
            <ChevronDownIcon
              className="size-3.5"
              color={'var(--ant-color-icon)'}
              fill={'transparent'}
              height={14}
              size={14}
              width={14}
            />
          </span>
        </div>
      </Button>
    );
  },
);

ActionIconWithChevron.displayName = 'ActionIconWithChevron';

export default ActionIconWithChevron;
