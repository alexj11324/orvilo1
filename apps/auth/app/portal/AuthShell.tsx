import type { PropsWithChildren } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { EntryShell } from '@/features/AuthShell/EntryShell';

import { usePortalMessages } from './messagesContext';

export const AuthShell = ({ children }: PropsWithChildren) => {
  const messages = usePortalMessages();

  return (
    <EntryShell
      data-testid="accounts-auth-shell"
      footer={messages.terms}
      brand={
        // The mark ships white-filled; flip it for the light canvas.
        <img
          alt={messages.brand}
          className="invert dark:invert-0"
          data-testid="orvilo-mark"
          height="40"
          src="/icons/icon.svg"
          width="40"
        />
      }
    >
      {children}
    </EntryShell>
  );
};

/** Progress and failure copy for the portal's redirect hops, where no form is shown. */
export const AuthNotice = ({ children, error }: PropsWithChildren<{ error?: boolean }>) =>
  error ? (
    <Alert className="w-full max-w-xs" variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  ) : (
    <p className="text-muted-foreground text-center text-sm" role="status">
      {children}
    </p>
  );
