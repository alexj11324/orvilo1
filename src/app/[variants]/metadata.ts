import { APPLE_APP_STORE_ID, BRANDING_NAME } from '@orvilo/business-const';
import { OG_URL } from '@orvilo/const';

import { DEFAULT_LANG } from '@/const/locale';
import { TWITTER_SITE } from '@/const/twitter';
import { OFFICIAL_URL } from '@/const/url';
import { translation } from '@/libs/i18n/serverTranslation';
import { type DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

const isDev = process.env.NODE_ENV === 'development';

export const generateMetadata = async (props: DynamicLayoutProps) => {
  const locale = await RouteVariants.getLocale(props);
  const { t } = await translation('metadata', locale);

  return {
    alternates: {
      canonical: OFFICIAL_URL,
    },
    appleWebApp: {
      statusBarStyle: 'black-translucent',
      title: BRANDING_NAME,
    },
    description: t('chat.description', { appName: BRANDING_NAME }),
    // This deployment ships a complete icon set under public/, rebuilt from its
    // own mark, so it is used as-is. Collapsing this to a single branding logo
    // URL would drop the apple-touch and shortcut icons, which iOS home screens
    // and Windows shortcuts respectively rely on.
    icons: {
      apple: '/apple-touch-icon.png?v=1',
      icon: isDev ? '/favicon-dev.ico' : '/favicon.ico?v=1',
      shortcut: isDev ? '/favicon-32x32-dev.ico' : '/favicon-32x32.ico?v=1',
    },
    ...(APPLE_APP_STORE_ID ? { itunes: { appId: APPLE_APP_STORE_ID } } : {}),
    manifest: '/manifest.json',
    metadataBase: new URL(OFFICIAL_URL),
    openGraph: {
      description: t('chat.description', { appName: BRANDING_NAME }),
      images: [
        {
          alt: t('chat.title', { appName: BRANDING_NAME }),
          height: 640,
          url: OG_URL,
          width: 1200,
        },
      ],
      locale: DEFAULT_LANG,
      siteName: BRANDING_NAME,
      title: BRANDING_NAME,
      type: 'website',
      url: OFFICIAL_URL,
    },
    title: {
      default: t('chat.title', { appName: BRANDING_NAME }),
      template: `%s · ${BRANDING_NAME}`,
    },
    twitter: {
      card: 'summary_large_image',
      description: t('chat.description', { appName: BRANDING_NAME }),
      images: [OG_URL],
      // Omitted when the deployment has no X account; see TWITTER_SITE.
      site: TWITTER_SITE,
      title: t('chat.title', { appName: BRANDING_NAME }),
    },
  };
};
