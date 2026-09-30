import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { memo, useRef } from 'react';

import { POPUP_Z_CLASS } from '@/components/ui/zIndex';

import { useDetailPopoverState } from '../components/useDetailPopoverState';

interface SkillRowProps {
  className?: string;
  /** Rich detail card shown while hovering the label cell. */
  detailContent?: ReactNode;
  detailDisabled?: boolean;
  label: ReactNode;
  labelClassName?: string;
  onContextMenu?: () => void;
  trailing: ReactNode;
  trailingClassName?: string;
}

/**
 * The hover detail card is anchored to the whole row but triggered only by the
 * label cell, so moving right onto the "..." button leaves the trigger and lets
 * the card go — the two used to share one hover, which is why a card could land
 * on top of the policy menu and swallow the click meant for it. The card is
 * also inert (pointer-events: none): a press landing on the portal'd card is
 * read by base-ui as an outside press that dismisses the enclosing menu.
 */
const SkillRow = memo<SkillRowProps>(
  ({
    className,
    detailContent,
    detailDisabled,
    label,
    labelClassName,
    onContextMenu,
    trailing,
    trailingClassName,
  }) => {
    const rowRef = useRef<HTMLSpanElement>(null);
    const { onOpenChange, open } = useDetailPopoverState(detailDisabled);

    const labelCell = <span className={labelClassName}>{label}</span>;

    return (
      <span
        className={className}
        ref={rowRef}
        onContextMenu={
          onContextMenu &&
          ((event) => {
            event.preventDefault();
            event.stopPropagation();
            onContextMenu();
          })
        }
      >
        {detailContent ? (
          <PopoverPrimitive.Root open={!detailDisabled && open} onOpenChange={onOpenChange}>
            <PopoverPrimitive.Trigger
              openOnHover
              delay={300}
              disabled={detailDisabled}
              render={labelCell}
            />
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Positioner
                align={'start'}
                anchor={rowRef}
                className={cn('isolate', POPUP_Z_CLASS)}
                side={'right'}
                sideOffset={8}
                style={{ pointerEvents: 'none' }}
              >
                <PopoverPrimitive.Popup
                  className={cn(
                    POPUP_Z_CLASS,
                    'flex origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-0 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden',
                  )}
                >
                  {detailContent}
                </PopoverPrimitive.Popup>
              </PopoverPrimitive.Positioner>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        ) : (
          labelCell
        )}
        <span data-tool-trailing className={trailingClassName}>
          {trailing}
        </span>
      </span>
    );
  },
);

SkillRow.displayName = 'SkillRow';

export default SkillRow;
