declare global {
  var __PORTAL_CONFIG__:
    { clerkProxyUrl?: string; clerkPublishableKey?: string; productOrigin?: string } | undefined;
}

export type PortalConfig = {
  clerkProxyUrl: string;
  clerkPublishableKey: string;
  productOrigin: string;
};

export const readPortalConfig = (): PortalConfig => {
  const injected = typeof globalThis === 'undefined' ? undefined : globalThis.__PORTAL_CONFIG__;
  return {
    // FAPI uses its own domain unless an explicit proxy is configured.
    clerkProxyUrl: injected?.clerkProxyUrl ?? import.meta.env.VITE_CLERK_PROXY_URL ?? '',
    clerkPublishableKey:
      injected?.clerkPublishableKey ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',
    productOrigin:
      injected?.productOrigin ||
      (import.meta.env.DEV && import.meta.env.VITE_PORTAL_PRODUCT_ORIGIN) ||
      'https://orvilo.aspectlylabs.com',
  };
};
