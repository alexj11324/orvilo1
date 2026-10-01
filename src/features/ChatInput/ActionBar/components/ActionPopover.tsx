'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import type { CSSProperties, ReactNode } from 'react';
import { createContext, memo, Suspense, use, useCallback, useMemo, useState } from 'react';

import DebugNode from '@/components/DebugNode';
import UpdateLoading from '@/components/Loading/UpdateLoading';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/useIsMobile';

import { popoverPlacement } from '../../popoverPlacement';

const prefixCls = 'ant';

const styles = createStaticStyles(({ css }) => ({
  popoverContent: css`
    .${prefixCls}-form {
      .${prefixCls}-form-item:first-child {
        padding-block: 0 4px;
      }
      .${prefixCls}-form-item:last-child {
        padding-block: 4px 0;
      }
    }
  `,
}));

const PopoverCloseContext = createContext<() => void>(() => {});

/**
 * Lets a popover's rendered `content` close the surrounding popover — the same
 * contract lobehub's `usePopoverContext().close` provided.
 */
export const usePopoverClose = () => use(PopoverCloseContext);

export type ActionPopoverTrigger = 'click' | 'hover' | ('click' | 'hover')[];

export interface ActionPopoverProps {
  children?: ReactNode;
  classNames?: { content?: string; root?: string; trigger?: string };
  content?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  loading?: boolean;
  maxHeight?: number | string;
  maxWidth?: number | string;
  minWidth?: number | string;
  mouseEnterDelay?: number;
  mouseLeaveDelay?: number;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  placement?: string;
  styles?: { content?: CSSProperties; root?: CSSProperties };
  title?: ReactNode;
  trigger?: ActionPopoverTrigger;
}

const parseTrigger = (trigger?: ActionPopoverTrigger) => {
  const normalized = new Set(
    (Array.isArray(trigger) ? trigger : [trigger ?? 'hover']).flatMap((item) =>
      item === 'hover' ? ['hover' as const] : [item as 'click'],
    ),
  );
  return { openOnClick: normalized.has('click'), openOnHover: normalized.has('hover') };
};

const ActionPopover = memo<ActionPopoverProps>(
  ({
    styles: customStyles,
    maxHeight,
    maxWidth,
    minWidth,
    children,
    classNames: customClassNames,
    title,
    placement,
    loading,
    extra,
    content,
    trigger,
    mouseEnterDelay,
    mouseLeaveDelay,
    disabled,
    open,
    onOpenChange,
  }) => {
    const isMobile = useIsMobile();
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = open !== undefined;
    const resolvedOpen = !disabled && (open ?? internalOpen);

    const { openOnClick, openOnHover } = parseTrigger(trigger);

    const close = useCallback(() => {
      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setInternalOpen(false);
      }
    }, [isControlled, onOpenChange]);

    const handleOpenChange = useCallback(
      (nextOpen: boolean, eventDetails?: { cancel?: () => void; reason?: string }) => {
        // Hover-only trigger: base-ui Trigger always wires useClick — cancel
        // press-driven opens so `trigger="hover"` keeps hover close semantics.
        if (!openOnClick && nextOpen && eventDetails?.reason === 'trigger-press') {
          eventDetails.cancel?.();
          return;
        }
        onOpenChange?.(nextOpen);
        if (!isControlled) setInternalOpen(nextOpen);
      },
      [openOnClick, onOpenChange, isControlled],
    );

    // Properly handle classNames (can be object or function)
    const resolvedClassNames =
      typeof customClassNames === 'function' ? customClassNames : customClassNames;
    const contentClassName =
      typeof resolvedClassNames === 'object' && resolvedClassNames?.content
        ? cx(styles.popoverContent, resolvedClassNames.content)
        : styles.popoverContent;

    // Properly handle styles (can be object or function)
    const resolvedStyles = typeof customStyles === 'function' ? customStyles : customStyles;
    const contentStyle =
      typeof resolvedStyles === 'object' && resolvedStyles?.content ? resolvedStyles.content : {};

    // Compose content with optional title
    const popoverContent = (
      <Suspense fallback={<DebugNode trace="ActionPopover > content" />}>
        <>
          {title && (
            <div className="flex flex-row gap-2 justify-between" style={{ marginBottom: 16 }}>
              {title}
              {extra}
              {loading && <UpdateLoading style={{ color: cssVar.colorTextSecondary }} />}
            </div>
          )}
          {content}
        </>
      </Suspense>
    );

    const { align, side } = popoverPlacement(isMobile ? 'top' : placement);

    const triggerElement = useMemo(
      () => (
        <PopoverTrigger
          className={resolvedClassNames?.trigger}
          closeDelay={mouseLeaveDelay === undefined ? undefined : mouseLeaveDelay * 1000}
          delay={mouseEnterDelay === undefined ? undefined : mouseEnterDelay * 1000}
          disabled={disabled}
          openOnHover={openOnHover && !disabled}
          render={<span className="inline-flex">{children}</span>}
        />
      ),
      [openOnHover, disabled, mouseEnterDelay, mouseLeaveDelay, children, resolvedClassNames],
    );

    return (
      <Popover open={resolvedOpen} onOpenChange={handleOpenChange}>
        {triggerElement}
        <PopoverContent
          align={align}
          className={cx('w-auto', contentClassName)}
          side={side}
          style={{
            maxHeight,
            maxWidth: isMobile ? undefined : maxWidth,
            minWidth: isMobile ? undefined : minWidth,
            width: isMobile ? '100vw' : undefined,
            ...contentStyle,
          }}
        >
          <PopoverCloseContext value={close}>{popoverContent}</PopoverCloseContext>
        </PopoverContent>
      </Popover>
    );
  },
);

export default ActionPopover;
