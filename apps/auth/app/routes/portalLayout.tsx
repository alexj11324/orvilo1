import { Outlet } from 'react-router';

import NextThemeProvider from '@/layout/GlobalProvider/NextThemeProvider';

import { resolveAuthLocale } from '../lib/locale';
import { resolvePortalLocale } from '../portal/locale';
import { PortalMessagesProvider } from '../portal/messagesContext';
import { readPortalConfig } from '../portal/portalConfig';
import { RuntimeClerkProvider } from '../portal/RuntimeClerkProvider';

// Bare: skips AuthAppShell's provider stack. The portal renders the shared
// EntryShell itself and only needs the theme attribute around it.
export const handle = { bare: true };

export default function PortalLayout() {
  const { locale } = resolvePortalLocale(resolveAuthLocale());
  const config = readPortalConfig();

  return (
    <NextThemeProvider>
      <PortalMessagesProvider locale={locale}>
        <RuntimeClerkProvider
          productOrigin={config.productOrigin}
          proxyUrl={config.clerkProxyUrl}
          publishableKey={config.clerkPublishableKey}
        >
          <Outlet />
        </RuntimeClerkProvider>
      </PortalMessagesProvider>
    </NextThemeProvider>
  );
}
