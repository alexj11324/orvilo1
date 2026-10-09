import '@/app/globals.css';

import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

interface EntryShellProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Controls pinned to the top corner, e.g. language and theme. */
  actions?: ReactNode;
  /** The product mark that sits above the page title. */
  brand: ReactNode;
  children: ReactNode;
  /** A quiet line under the content, e.g. the terms or a hint. */
  footer?: ReactNode;
}

/**
 * Chrome shared by every signed-out entry page: the accounts portal, the auth
 * routes and the desktop sign-in. Layout only — each host passes its own mark,
 * controls and footer, so it renders without the i18n and theme providers the
 * bare portal routes skip.
 *
 * The block hangs from a fixed offset rather than centring, so swapping the
 * method list for a single field does not move the mark or the title.
 */
export const EntryShell = ({
  actions,
  brand,
  children,
  className,
  footer,
  ...props
}: EntryShellProps) => (
  <div
    className={cn(
      'orvilo-entry-surface bg-background text-foreground relative flex min-h-dvh w-full flex-col items-center px-6 pt-[18vh] pb-10',
      className,
    )}
    {...props}
  >
    {actions ? (
      <div className="absolute top-3 right-3 flex items-center gap-1">{actions}</div>
    ) : null}
    <header className="flex shrink-0 items-center justify-center">{brand}</header>
    <main className="mt-6 flex w-full flex-col items-center">{children}</main>
    {footer ? (
      <footer className="text-muted-foreground mt-5 w-full max-w-sm text-center text-[13px] leading-5 text-balance">
        {footer}
      </footer>
    ) : null}
  </div>
);

/** The single column every entry page puts its content in. */
export const EntryPanel = ({ className, ...props }: ComponentProps<'section'>) => (
  <section className={cn('mx-auto flex w-full max-w-xs flex-col gap-3', className)} {...props} />
);

interface EntryHeadingProps {
  description?: ReactNode;
  title: ReactNode;
}

export const EntryHeading = ({ description, title }: EntryHeadingProps) => (
  <div className="mb-5 flex flex-col gap-2 text-center">
    <h1 className="m-0 text-xl font-medium tracking-tight">{title}</h1>
    {description ? (
      <p className="text-muted-foreground m-0 text-sm leading-6">{description}</p>
    ) : null}
  </div>
);
