import '@/app/globals.css';

import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

interface EntryShellProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Controls on the header's trailing edge, e.g. language and theme. */
  actions?: ReactNode;
  brand: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Chrome shared by every signed-out entry page: the accounts portal, the auth
 * routes and the desktop sign-in. Layout only — each host passes its own brand,
 * controls and footer, so it renders without the i18n and theme providers the
 * bare portal routes skip.
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
      'orvilo-entry-surface bg-background text-foreground flex min-h-dvh w-full flex-col',
      className,
    )}
    {...props}
  >
    <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5 sm:px-8 sm:py-6 lg:px-10">
      <span aria-hidden />
      <div className="flex items-center">{brand}</div>
      <div className="flex items-center justify-end gap-1">{actions}</div>
    </header>
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-8 sm:py-12">
      {children}
    </main>
    {footer ? (
      <footer className="text-muted-foreground shrink-0 px-6 py-6 text-center text-xs leading-5">
        {footer}
      </footer>
    ) : null}
  </div>
);

/** The single column every entry page puts its content in. */
export const EntryPanel = ({ className, ...props }: ComponentProps<'section'>) => (
  <section className={cn('mx-auto flex w-full max-w-sm flex-col gap-6', className)} {...props} />
);

interface EntryHeadingProps {
  description?: ReactNode;
  title: ReactNode;
}

export const EntryHeading = ({ description, title }: EntryHeadingProps) => (
  <div className="flex flex-col gap-2 text-center">
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    {description ? <p className="text-muted-foreground text-sm leading-6">{description}</p> : null}
  </div>
);
