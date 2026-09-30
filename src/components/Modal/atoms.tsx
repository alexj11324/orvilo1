'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { Dialog } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Modal tier sits below the floating-overlay tier (POPUP_Z_CLASS = z-[1300],
 * see src/components/ui/zIndex.ts) so selects/menus opened from inside a
 * modal paint above it.
 */
const BACKDROP_Z = 'z-[1200]';
const POPUP_Z = 'z-[1201]';

type ModalPortalProps = React.ComponentProps<typeof Dialog.Portal>;
const ModalPortal = (props: ModalPortalProps) => <Dialog.Portal {...props} keepMounted />;

type ModalBackdropProps = React.ComponentProps<typeof Dialog.Backdrop>;
const ModalBackdrop = ({ className, ...rest }: ModalBackdropProps) => (
  <Dialog.Backdrop
    className={cn(
      'fixed inset-0 isolate bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
      BACKDROP_Z,
      className,
    )}
    {...rest}
  />
);

interface ModalPopupProps extends React.ComponentProps<typeof Dialog.Popup> {
  width?: number | string;
}
const ModalPopup = ({ className, style, width, ...rest }: ModalPopupProps) => (
  <Dialog.Popup
    style={{ maxWidth: width ?? 520, ...style }}
    className={cn(
      'fixed top-1/2 left-1/2 flex w-full max-w-[calc(100%-32px)] max-h-[calc(100dvh-64px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
      POPUP_Z,
      className,
    )}
    {...rest}
  />
);

const ModalHeader = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex min-h-12 items-center justify-between px-4 py-2', className)}
    {...rest}
  />
);

type ModalTitleProps = React.ComponentProps<typeof Dialog.Title>;
const ModalTitle = ({ className, ...rest }: ModalTitleProps) => (
  <Dialog.Title
    className={cn('m-0 text-sm leading-[1.4] font-semibold text-foreground', className)}
    {...rest}
  />
);

type ModalDescriptionProps = React.ComponentProps<typeof Dialog.Description>;
const ModalDescription = ({ className, ...rest }: ModalDescriptionProps) => (
  <Dialog.Description className={cn('text-sm text-muted-foreground', className)} {...rest} />
);

const ModalContent = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('overflow-hidden auto px-4 pb-4', className)} {...rest} />
);

const ModalFooter = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-end gap-2 px-4 py-3', className)} {...rest} />
);

type AlertModalPortalProps = React.ComponentProps<typeof AlertDialogPrimitive.Portal>;
const AlertModalPortal = (props: AlertModalPortalProps) => (
  <AlertDialogPrimitive.Portal {...props} />
);

interface AlertModalBackdropProps extends React.ComponentProps<
  typeof AlertDialogPrimitive.Backdrop
> {}
const AlertModalBackdrop = ({ className, ...rest }: AlertModalBackdropProps) => (
  <AlertDialogPrimitive.Backdrop
    className={cn(
      'fixed inset-0 isolate bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
      BACKDROP_Z,
      className,
    )}
    {...rest}
  />
);

interface AlertModalPopupProps extends React.ComponentProps<typeof AlertDialogPrimitive.Popup> {
  width?: number | string;
}
const AlertModalPopup = ({ className, style, width, ...rest }: AlertModalPopupProps) => (
  <AlertDialogPrimitive.Popup
    style={{ maxWidth: width ?? 520, ...style }}
    className={cn(
      'fixed top-1/2 left-1/2 flex w-full max-w-[calc(100%-32px)] max-h-[calc(100dvh-64px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
      POPUP_Z,
      className,
    )}
    {...rest}
  />
);

interface AlertModalTitleProps extends React.ComponentProps<typeof AlertDialogPrimitive.Title> {}
const AlertModalTitle = ({ className, ...rest }: AlertModalTitleProps) => (
  <AlertDialogPrimitive.Title
    className={cn('m-0 text-sm leading-[1.4] font-semibold text-foreground', className)}
    {...rest}
  />
);

const modalCloseStyle: CSSProperties = { height: 32, width: 32 };

interface AlertModalCloseProps extends React.ComponentProps<typeof AlertDialogPrimitive.Close> {
  children?: ReactNode;
}
const AlertModalClose = ({ className, children, style, ...rest }: AlertModalCloseProps) => (
  <AlertDialogPrimitive.Close
    style={{ ...modalCloseStyle, ...style }}
    className={cn(
      'absolute top-2 right-3 inline-flex cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 text-muted-foreground transition-all hover:scale-[1.04] hover:bg-muted hover:text-foreground',
      className,
    )}
    {...rest}
  >
    {children ?? <XIcon size={16} />}
  </AlertDialogPrimitive.Close>
);

interface ModalCloseProps extends React.ComponentProps<typeof Dialog.Close> {
  children?: ReactNode;
}
const ModalClose = ({ className, children, style, ...rest }: ModalCloseProps) => (
  <Dialog.Close
    style={{ ...modalCloseStyle, ...style }}
    className={cn(
      'absolute top-2 right-3 inline-flex cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 text-muted-foreground transition-all hover:scale-[1.04] hover:bg-muted hover:text-foreground',
      className,
    )}
    {...rest}
  >
    {children ?? <XIcon size={16} />}
  </Dialog.Close>
);

export {
  AlertModalBackdrop,
  AlertModalClose,
  AlertModalPopup,
  AlertModalPortal,
  AlertModalTitle,
  ModalBackdrop,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalPopup,
  ModalPortal,
  ModalTitle,
};
export type { ModalBackdropProps, ModalCloseProps, ModalPopupProps, ModalPortalProps };
