'use client';

import { Popover } from '@base-ui/react/popover';
import { type HTMLAttributes, type KeyboardEvent } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { useOverlayPopoverPortalProps } from '@/features/NavPanel/OverlayContainer';

function FocusableInput(props: HTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    queueMicrotask(() => {
      ref.current?.focus();
    });
  }, []);
  return <Input {...props} ref={ref} />;
}

export interface InlineRenameProps {
  /**
   * Callback when editing is cancelled (Escape key)
   */
  onCancel?: () => void;
  /**
   * Callback when open state changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Callback to save the new title
   */
  onSave: (newTitle: string) => void | Promise<void>;
  /**
   * Whether the popover is open (editing mode)
   */
  open: boolean;
  /**
   * Popover placement
   */
  placement?: 'bottom' | 'bottomLeft' | 'top' | 'topLeft';
  /**
   * Current title
   */
  title: string;
  /**
   * Popover width
   */
  width?: number;
}

const InlineRename = memo<InlineRenameProps>(
  ({ open, title, onOpenChange, onSave, onCancel, placement = 'bottomLeft', width = 320 }) => {
    const [newTitle, setNewTitle] = useState(title);
    const savedRef = useRef(false);
    const popoverPortalProps = useOverlayPopoverPortalProps();

    // Reset state when opening
    useEffect(() => {
      if (open) {
        setNewTitle(title);
        savedRef.current = false;
      }
    }, [open, title]);

    const handleSave = useCallback(async () => {
      if (savedRef.current) return;

      if (newTitle && title !== newTitle) {
        savedRef.current = true;
        await onSave(newTitle);
      }
    }, [newTitle, title, onSave]);

    const handleClose = useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel?.();
          handleClose();
        }
      },
      [onCancel, handleClose],
    );

    const side = placement.startsWith('top') ? 'top' : 'bottom';
    const align = placement.endsWith('Left') ? 'start' : 'center';

    return (
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleSave();
          onOpenChange(nextOpen);
        }}
      >
        <Popover.Trigger render={<div />} />
        <Popover.Portal {...(popoverPortalProps ?? {})}>
          <Popover.Positioner align={align} side={side} sideOffset={4}>
            <Popover.Popup className={POPUP_Z_CLASS} style={{ padding: 4, width }}>
              <FocusableInput
                defaultValue={title}
                onBlur={handleSave}
                onChange={(e) => setNewTitle((e.target as HTMLInputElement).value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  handleKeyDown(e as KeyboardEvent);
                  if (e.key === 'Enter') {
                    handleSave();
                    handleClose();
                  }
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);

export default InlineRename;
