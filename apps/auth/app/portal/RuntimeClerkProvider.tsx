import { ClerkProvider } from '@clerk/react-router';
import { createContext, type PropsWithChildren, use } from 'react';

import { AuthNotice, AuthShell } from './AuthShell';
import { AUTH_CONTRACT } from './contract';
import { usePortalMessages } from './messagesContext';

const ProductOriginContext = createContext<string>(AUTH_CONTRACT.origins.product);

export const useProductOrigin = (): string => use(ProductOriginContext);

export const RuntimeClerkProvider = ({
  children,
  productOrigin,
  proxyUrl,
  publishableKey,
}: PropsWithChildren<{ productOrigin: string; proxyUrl: string; publishableKey: string }>) => {
  const messages = usePortalMessages();

  if (!publishableKey) {
    return (
      <AuthShell>
        <AuthNotice error>{messages.unavailable}</AuthNotice>
      </AuthShell>
    );
  }

  return (
    <ClerkProvider proxyUrl={proxyUrl || undefined} publishableKey={publishableKey}>
      <ProductOriginContext value={productOrigin}>{children}</ProductOriginContext>
    </ClerkProvider>
  );
};
