import type { PropsWithChildren } from 'react';

import { usePortalMessages } from './messagesContext';

export const AuthShell = ({ children }: PropsWithChildren) => {
  const messages = usePortalMessages();

  return (
    <main className="accounts-auth-shell" data-testid="accounts-auth-shell">
      <aside
        className="accounts-auth-brand-panel accounts-auth-brand-panel--left"
        data-panel-tone="charcoal"
        data-testid="accounts-auth-brand-panel"
      >
        <div className="accounts-brand-lockup">
          <img alt="" data-testid="orvilo-mark" height="28" src="/icons/icon.svg" width="28" />
          <span>{messages.brand}</span>
        </div>
      </aside>
      <section
        className="accounts-auth-form-panel accounts-auth-form-panel--right"
        data-panel-tone="black"
        data-testid="accounts-auth-form-panel"
      >
        <span className="accounts-auth-login-label">{messages.login}</span>
        <div className="accounts-auth-form-content">{children}</div>
      </section>
    </main>
  );
};
