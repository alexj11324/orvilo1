import { ClerkProvider } from '@clerk/react-router';
import { createContext, type PropsWithChildren, use } from 'react';

import { AuthShell } from './AuthShell';
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
        <p role="alert">{messages.unavailable}</p>
      </AuthShell>
    );
  }

  return (
    <ClerkProvider proxyUrl={proxyUrl || undefined} publishableKey={publishableKey}>
      <ProductOriginContext value={productOrigin}>{children}</ProductOriginContext>
    </ClerkProvider>
  );
};
