import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';

export const transparencyClassName =
  'bg-[conic-gradient(var(--fill-quaternary)_25%,var(--background)_0_50%,var(--fill-quaternary)_0_75%,var(--background)_0)] [background-size:calc(var(--spacing)*2)_calc(var(--spacing)*2)]';

export const SwatchButton = ({
  color,
  disabled,
  onClick,
  selected,
  shape = 'circle',
  size = 24,
  title,
}: {
  color: string;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  selected?: boolean;
  shape?: 'circle' | 'square';
  size?: number;
  title?: ReactNode;
}) => {
  const { t } = useTranslation('ui');
  // `size` is caller color-preview data, separate from the 36/40px control role.
  const large = size > 32;
  return (
    <SimpleTooltip title={title}>
      <span className="inline-flex pointer-coarse:p-1">
        <Button
          aria-pressed={selected}
          disabled={disabled}
          size={large ? 'large' : 'normal'}
          style={size > 40 ? { minHeight: size, minWidth: size } : undefined}
          type="button"
          variant="ghost"
          className={cn(
            "relative p-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-1 pointer-coarse:after:content-['']",
            large ? 'w-10' : 'w-9',
            shape === 'circle' ? 'rounded-full' : 'rounded-(--radius-button)',
            selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          )}
          onClick={onClick}
        >
          <span className="sr-only">
            {title === '' || title === false || title == null
              ? t('colorSwatches.select', { color })
              : title}
          </span>
          <span
            aria-hidden
            data-color-preview=""
            style={{ color, height: size, width: size }}
            className={cn(
              'relative inline-flex max-h-full max-w-full items-center justify-center overflow-hidden',
              transparencyClassName,
              shape === 'circle' ? 'rounded-full' : 'rounded-(--radius-button)',
            )}
          >
            <span className="absolute inset-0" style={{ backgroundColor: color }} />
            {selected && (
              <span className="relative inline-flex size-5 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border">
                <CheckIcon className="size-4" />
              </span>
            )}
          </span>
        </Button>
      </span>
    </SimpleTooltip>
  );
};
