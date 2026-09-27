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
    // Empty on prod: FAPI is reached via its own domain. Local dev sets
    // VITE_CLERK_PROXY_URL=/__clerk so clerk-js traffic stays same-origin.
    clerkProxyUrl: injected?.clerkProxyUrl ?? import.meta.env.VITE_CLERK_PROXY_URL ?? '',
    clerkPublishableKey:
      injected?.clerkPublishableKey ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',
    productOrigin: injected?.productOrigin || 'https://orvilo.aspectlylabs.com',
  };
};
