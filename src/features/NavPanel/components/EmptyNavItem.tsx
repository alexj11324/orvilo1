import { clsx as cx } from 'cn';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';

interface EmptyStatusProps {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}

const EmptyNavItem = memo<EmptyStatusProps>(({ title, onClick, className, disabled }) => {
  return (
    <Button
      disabled={disabled}
      size="compact"
      type="button"
      variant="ghost"
      className={cx(
        'flex w-full items-center justify-start gap-2 px-0.5 text-sm leading-5.5 font-normal text-foreground whitespace-normal pointer-coarse:min-h-11',
        !disabled && 'cursor-pointer',
        disabled &&
          'disabled:pointer-events-auto disabled:cursor-not-allowed disabled:hover:bg-transparent',
        className,
      )}
      onClick={disabled ? undefined : onClick}
    >
      {/* The passive 28px slot aligns with sidebar identity frames; its visible glyph is16. */}
      <span className="flex size-7 flex-none flex-col items-center justify-center">
        <PlusIcon className="size-4" size={16} />
      </span>
      <span className="text-center text-muted-foreground">{title}</span>
    </Button>
  );
});

export default EmptyNavItem;
