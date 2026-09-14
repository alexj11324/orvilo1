import { type MetadataRoute } from 'next';

const manifest = async (): Promise<MetadataRoute.Manifest> => {
  // Skip heavy module compilation in development. The branding constant is
  // still imported — hardcoding it here would show the upstream brand in the
  // dev PWA manifest — but it is pulled in on its own, below, rather than
  // alongside the heavy modules: a module-scope import of the same name would
  // be shadowed by the destructuring further down, which is why it is scoped
  // to this branch.
  if (process.env.NODE_ENV === 'development') {
    const { BRANDING_NAME } = await import('@orvilo/business-const');

    return {
      background_color: '#000000',
      description: `${BRANDING_NAME} Development`,
      display: 'standalone',
      icons: [
        {
          sizes: '192x192',
          src: '/app-icons/icon-192x192.png',
          type: 'image/png',
        },
      ],
      name: BRANDING_NAME,
      short_name: BRANDING_NAME,
      start_url: '/',
      theme_color: '#000000',
    };
  }

  const [{ BRANDING_LOGO_URL, BRANDING_NAME }, { kebabCase }, { manifestModule }] =
    await Promise.all([
      import('@orvilo/business-const'),
      import('es-toolkit/compat'),
      import('@/libs/metadata/manifest'),
    ]);

  // @ts-expect-error - manifestModule.generate returns extended manifest with custom properties
  return manifestModule.generate({
    description: `${BRANDING_NAME} is a work-and-lifestyle space to find, build, and collaborate with agent teams that grow with you.`,
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        url: '/app-icons/icon-192x192.png',
      },
      {
        purpose: 'maskable',
        sizes: '192x192',
        url: '/app-icons/icon-192x192.maskable.png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        url: '/app-icons/icon-512x512.png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        url: '/app-icons/icon-512x512.maskable.png',
      },
    ],
    id: kebabCase(BRANDING_NAME),
    name: BRANDING_NAME,
    screenshots: BRANDING_LOGO_URL
      ? []
      : [
          {
            form_factor: 'narrow',
            url: '/screenshots/shot-1.mobile.png',
          },
          {
            form_factor: 'narrow',
            url: '/screenshots/shot-2.mobile.png',
          },
          {
            form_factor: 'narrow',
            url: '/screenshots/shot-3.mobile.png',
          },
          {
            form_factor: 'narrow',
            url: '/screenshots/shot-4.mobile.png',
          },
          {
            form_factor: 'narrow',
            url: '/screenshots/shot-5.mobile.png',
          },
          {
            form_factor: 'wide',
            url: '/screenshots/shot-1.desktop.png',
          },
          {
            form_factor: 'wide',
            url: '/screenshots/shot-2.desktop.png',
          },
          {
            form_factor: 'wide',
            url: '/screenshots/shot-3.desktop.png',
          },
          {
            form_factor: 'wide',
            url: '/screenshots/shot-4.desktop.png',
          },
          {
            form_factor: 'wide',
            url: '/screenshots/shot-5.desktop.png',
          },
        ],
  });
};

export default manifest;
