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
        <span className="flex items-center gap-2 text-lg font-medium tracking-tight">
          {/* The mark ships white-filled; flip it for the light canvas. */}
          <img
            alt=""
            className="invert dark:invert-0"
            data-testid="orvilo-mark"
            height="28"
            src="/icons/icon.svg"
            width="28"
          />
          {messages.brand}
        </span>
      }
    >
      {children}
    </EntryShell>
  );
};

/** Progress and failure copy for the portal's redirect hops, where no form is shown. */
export const AuthNotice = ({ children, error }: PropsWithChildren<{ error?: boolean }>) =>
  error ? (
    <Alert className="w-full max-w-sm" variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  ) : (
    <p className="text-muted-foreground text-center text-sm" role="status">
      {children}
    </p>
  );
