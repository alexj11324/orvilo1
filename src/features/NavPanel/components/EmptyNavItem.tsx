import { cx } from 'antd-style';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';

interface EmptyStatusProps {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}

const EmptyNavItem = memo<EmptyStatusProps>(({ title, onClick, className, disabled }) => {
  return (
    <div
      style={{ ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : undefined) }}
      className={cx(
        className,
        'flex items-center gap-2 h-[32px] px-[2px]',
        !disabled && 'cursor-pointer hover:bg-[var(--ant-color-fill-tertiary)]',
      )}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex flex-col items-center justify-center flex-none h-[28px] w-[28px]">
        <PlusIcon size={16} />
      </div>
      <div className="text-center text-muted-foreground">{title}</div>
    </div>
  );
});

export default EmptyNavItem;
