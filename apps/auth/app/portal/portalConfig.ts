declare global {
  var __PORTAL_CONFIG__: { clerkPublishableKey?: string; productOrigin?: string } | undefined;
}

export type PortalConfig = {
  clerkPublishableKey: string;
  productOrigin: string;
};

export const readPortalConfig = (): PortalConfig => {
  const injected = typeof globalThis === 'undefined' ? undefined : globalThis.__PORTAL_CONFIG__;
  return {
    clerkPublishableKey:
      injected?.clerkPublishableKey ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',
    productOrigin: injected?.productOrigin || 'https://orvilo.aspectlylabs.com',
  };
};
