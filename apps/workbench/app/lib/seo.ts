import { BRANDING_NAME } from '@orvilo/business-const';
import type { MetaDescriptor } from 'react-router';
import urlJoin from 'url-join';

import { TWITTER_SITE } from '@/const/twitter';
import { OFFICIAL_SITE, OG_URL } from '@/const/url';

// Resolved against this deployment's own origin — OG scrapers do not resolve
// relative image paths, and the artwork has to be one this deployment serves
// rather than one hosted upstream. `TWITTER_SITE` is `undefined` when no X
// account is configured, and the tag is then omitted rather than emitted empty.
const OG_IMAGE_URL = urlJoin(OFFICIAL_SITE, OG_URL);

/**
 * The workbench serves one surface now — the mobile agent-document reader. Its
 * description used to be read out of the `verify` i18n namespace, which
 * advertised the standalone Acceptance/Verify platform; that platform is
 * retired, so the copy described a product this deployment no longer has. The
 * tag is `noindex, nofollow`, but stale copy is still wrong to ship.
 */
const DESCRIPTION = 'Orvilo agent documents, rendered for mobile.';

export const workbenchMetaDescription = (): string => DESCRIPTION;

interface BuildPageMetaOptions {
  description: string;
  locale?: string;
  title: string;
  type?: 'article' | 'website';
}

export const buildPageMeta = ({
  description,
  locale = 'en-US',
  title,
  type = 'website',
}: BuildPageMetaOptions): MetaDescriptor[] => [
  { title },
  { content: description, name: 'description' },
  { content: 'noindex, nofollow', name: 'robots' },
  { content: title, property: 'og:title' },
  { content: description, property: 'og:description' },
  { content: type, property: 'og:type' },
  { content: BRANDING_NAME, property: 'og:site_name' },
  { content: locale.replace('-', '_'), property: 'og:locale' },
  { content: OG_IMAGE_URL, property: 'og:image' },
  { content: title, property: 'og:image:alt' },
  { content: 'summary_large_image', name: 'twitter:card' },
  // Omitted when the deployment has no X account; see TWITTER_SITE.
  ...(TWITTER_SITE ? [{ content: TWITTER_SITE, name: 'twitter:site' }] : []),
  { content: title, name: 'twitter:title' },
  { content: description, name: 'twitter:description' },
  { content: OG_IMAGE_URL, name: 'twitter:image' },
];
