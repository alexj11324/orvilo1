import { APPLE_APP_STORE_ID, BRANDING_NAME } from '@orvilo/business-const';
import { OG_URL } from '@orvilo/const';

import { getServerFeatureFlagsValue } from '@/config/featureFlags';
import { TWITTER_SITE } from '@/const/twitter';
import { OFFICIAL_URL } from '@/const/url';
import { appEnv } from '@/envs/app';
import { fileEnv } from '@/envs/file';
import { pythonEnv } from '@/envs/python';
import { translation } from '@/libs/i18n/serverTranslation';
import { buildAnalyticsConfig, fetchViteDevTemplate, renderSpaHtml } from '@/libs/spaHtml';
import { type Locales } from '@/locales/resources';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { type SPAClientEnv, type SPAServerConfig } from '@/types/spaServerConfig';
import { RouteVariants } from '@/utils/server/routeVariants';

export function generateStaticParams() {
  const staticLocales: Locales[] = ['en-US', 'zh-CN'];

  // Only the mobile renderer is served from here now — the browser SPA is gone
  // and the desktop app ships its own renderer inside Electron.
  return staticLocales.map((locale) => ({
    variants: RouteVariants.serializeVariants({ isMobile: true, locale }),
  }));
}

const isDev = process.env.NODE_ENV === 'development';

async function getTemplate(): Promise<string> {
  if (isDev) return fetchViteDevTemplate();

  const { mobileHtmlTemplate } = await import('./spaHtmlTemplates');

  return mobileHtmlTemplate;
}

function buildClientEnv(): SPAClientEnv {
  return {
    marketBaseUrl: appEnv.MARKET_BASE_URL,
    pyodideIndexUrl: pythonEnv.NEXT_PUBLIC_PYODIDE_INDEX_URL,
    pyodidePipIndexUrl: pythonEnv.NEXT_PUBLIC_PYODIDE_PIP_INDEX_URL,
    s3FilePath: fileEnv.NEXT_PUBLIC_S3_FILE_PATH,
  };
}

async function buildSeoMeta(locale: string): Promise<string> {
  const { t } = await translation('metadata', locale);
  const title = t('chat.title', { appName: BRANDING_NAME });
  const description = t('chat.description', { appName: BRANDING_NAME });

  const metas = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${OFFICIAL_URL}" />`,
    `<meta property="og:image" content="${OG_URL}" />`,
    `<meta property="og:site_name" content="${BRANDING_NAME}" />`,
    `<meta property="og:locale" content="${locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_URL}" />`,
    // Omitted when the deployment has no X account; see TWITTER_SITE.
    ...(TWITTER_SITE ? [`<meta name="twitter:site" content="${TWITTER_SITE}" />`] : []),
  ];

  if (APPLE_APP_STORE_ID) {
    metas.push(`<meta name="apple-itunes-app" content="app-id=${APPLE_APP_STORE_ID}" />`);
  }

  return metas.join('\n    ');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[]; variants: string }> },
) {
  const { variants } = await params;
  const { locale } = RouteVariants.deserializeVariants(variants);

  const spaConfig: SPAServerConfig = {
    analyticsConfig: buildAnalyticsConfig({ desktop: true }),
    clientEnv: buildClientEnv(),
    config: await getServerGlobalConfig(),
    featureFlags: getServerFeatureFlagsValue(),
    isMobile: true,
  };

  const template = await getTemplate();
  const seoMeta = await buildSeoMeta(locale);

  return renderSpaHtml(template, { seoMeta, serverConfig: spaConfig });
}
