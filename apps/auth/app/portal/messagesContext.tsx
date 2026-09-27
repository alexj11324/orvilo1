import { createContext, type PropsWithChildren, use } from 'react';

import { resolveAuthLocale } from '../lib/locale';
import type { PortalLocale } from './locale';
import { messagesForLocale, type PortalMessages } from './messages';

const PortalMessagesContext = createContext<PortalMessages>(messagesForLocale('en'));

export const PortalMessagesProvider = ({
  locale,
  children,
}: PropsWithChildren<{ locale: PortalLocale }>) => (
  <PortalMessagesContext value={messagesForLocale(locale)}>{children}</PortalMessagesContext>
);

/** Default provider-less read: resolve from the prerendered document's lang. */
export const usePortalMessages = (): PortalMessages => use(PortalMessagesContext);

export const documentPortalMessages = (): PortalMessages => messagesForLocale(resolveAuthLocale());
