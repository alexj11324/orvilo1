import '../portal/styles.css';

import { Outlet } from 'react-router';

import { resolveAuthLocale } from '../lib/locale';
import { resolvePortalLocale } from '../portal/locale';
import { PortalMessagesProvider } from '../portal/messagesContext';
import { readPortalConfig } from '../portal/portalConfig';
import { RuntimeClerkProvider } from '../portal/RuntimeClerkProvider';

export default function PortalLayout() {
  const { locale } = resolvePortalLocale(resolveAuthLocale());
  const config = readPortalConfig();

  return (
    <div className="accounts-portal-root">
      <PortalMessagesProvider locale={locale}>
        <RuntimeClerkProvider
          productOrigin={config.productOrigin}
          publishableKey={config.clerkPublishableKey}
        >
          <Outlet />
        </RuntimeClerkProvider>
      </PortalMessagesProvider>
    </div>
  );
}
