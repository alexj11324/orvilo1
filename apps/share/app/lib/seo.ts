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

type DescriptionKey = 'artifactDescription' | 'pageDescription' | 'topicDescription';

const FALLBACK_DESCRIPTION: Record<DescriptionKey, string> = {
  artifactDescription: `An artifact shared from ${BRANDING_NAME}.`,
  pageDescription: `A page shared from ${BRANDING_NAME}.`,
  topicDescription: `A conversation shared from ${BRANDING_NAME}.`,
};

export const shareMetaDescription = (resources: unknown, key: DescriptionKey): string => {
  const chat = (resources as Record<string, Record<string, unknown>> | undefined)?.chat;
  const text = chat?.[`sharePage.meta.${key}`];

  return typeof text === 'string'
    ? text.replaceAll('{{appName}}', BRANDING_NAME)
    : FALLBACK_DESCRIPTION[key];
};

export const truncateDescription = (text: string | null | undefined, max = 200) => {
  if (!text) return undefined;
  const clean = text.replaceAll(/\s+/g, ' ').trim();
  if (!clean) return undefined;

  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

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
  // Mirrors the apex robots.txt, which disallows /share/*: shared links are
  // meant to be passed around, not indexed. OG scrapers still read the card.
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
