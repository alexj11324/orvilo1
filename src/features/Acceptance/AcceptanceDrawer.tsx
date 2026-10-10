'use client';

import type { CSSProperties, ReactNode } from 'react';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

interface AcceptanceDrawerStyles {
  bodyContent?: CSSProperties;
  close?: CSSProperties;
  header?: CSSProperties;
  panel?: CSSProperties;
}

interface AcceptanceDrawerProps {
  children?: ReactNode;
  containerMaxWidth?: string;
  noHeader?: boolean;
  onClose?: () => void;
  open?: boolean;
  placement?: 'bottom' | 'left' | 'right' | 'top';
  push?: boolean;
  styles?: AcceptanceDrawerStyles;
  title?: ReactNode;
  width?: number | string;
}

/** Keep each reading level full-width on phones, with a persistent exit. */
export const AcceptanceDrawer = ({
  children,
  noHeader,
  onClose,
  open,
  placement = 'right',
  styles,
  title,
  width,
}: AcceptanceDrawerProps) => {
  const mobile = useIsMobile();

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose?.()}>
      <SheetContent
        showCloseButton={mobile || !noHeader}
        side={placement}
        style={{
          ...styles?.panel,
          maxWidth: 'none',
          paddingBottom: mobile ? 'env(safe-area-inset-bottom)' : undefined,
          width: mobile ? '100%' : width,
        }}
      >
        {noHeader && title !== undefined ? (
          <SheetTitle className="sr-only">{title}</SheetTitle>
        ) : null}
        {!noHeader && !mobile && title !== undefined ? (
          <SheetHeader
            style={{
              ...styles?.header,
              paddingBlock: mobile ? 'max(4px, env(safe-area-inset-top)) 4px' : undefined,
            }}
          >
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
        ) : null}
        <div
          className="flex flex-col min-h-0 flex-1"
          style={{
            display: 'flex',
            flexDirection: 'column',
            ...styles?.bodyContent,
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
};
