import { ClerkProvider } from '@clerk/react-router';
import { createContext, type PropsWithChildren } from 'react';

import { AuthShell } from './AuthShell';
import { AUTH_CONTRACT } from './contract';
import { usePortalMessages } from './messagesContext';

const ProductOriginContext = createContext<string>(AUTH_CONTRACT.origins.product);

export const useProductOrigin = (): string => use(ProductOriginContext);

export const RuntimeClerkProvider = ({
  children,
  productOrigin,
  publishableKey,
}: PropsWithChildren<{ productOrigin: string; publishableKey: string }>) => {
  const messages = usePortalMessages();

  if (!publishableKey) {
    return (
      <AuthShell>
        <p role="alert">{messages.unavailable}</p>
      </AuthShell>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ProductOriginContext value={productOrigin}>{children}</ProductOriginContext>
    </ClerkProvider>
  );
};
