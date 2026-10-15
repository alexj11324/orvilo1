'use client';

import type { ComponentProps } from 'react';
import { defaultUrlTransform, type ExtraProps } from 'streamdown';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

import type { CitationItem } from './plugins';

/** Citation metadata is untrusted model/server content: validate its destination too. */
export const citationHref = (url: string) =>
  defaultUrlTransform(url, 'href', {
    type: 'element',
    tagName: 'a',
    properties: {},
    children: [],
  }) || undefined;

export function CitationLink({
  detail,
  children,
  ...props
}: ComponentProps<'a'> & { detail?: CitationItem }) {
  const href = citationHref(detail?.url || props.href || '');
  const link = (
    <a
      {...props}
      className="rounded-(--radius-chip) bg-muted px-1 text-xs text-primary-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      href={href}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      target={href?.startsWith('http') ? '_blank' : undefined}
    >
      {children}
    </a>
  );
  if (!detail || !href) return link;
  let host: string;
  try {
    host = new URL(href).hostname;
  } catch {
    host = href;
  }
  return (
    <HoverCard>
      <HoverCardTrigger render={link} />
      <HoverCardContent className="flex flex-col gap-2 p-3">
        <a
          className="break-all text-sm text-primary-text hover:underline"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {detail.title && detail.title !== href ? detail.title : host}
        </a>
        {detail.summary && <p className="text-sm text-muted-foreground">{detail.summary}</p>}
        <span className="break-all text-xs text-foreground-tertiary">{host}</span>
      </HoverCardContent>
    </HoverCard>
  );
}

export function citationDetail(props: ComponentProps<'a'> & ExtraProps): CitationItem | undefined {
  const encoded = props.node?.properties.dataCitationDetail;
  if (typeof encoded !== 'string') return;
  try {
    const detail: unknown = JSON.parse(encoded);
    if (
      !detail ||
      typeof detail !== 'object' ||
      !('url' in detail) ||
      typeof detail.url !== 'string'
    )
      return;
    return {
      url: detail.url,
      ...('title' in detail && typeof detail.title === 'string' && { title: detail.title }),
      ...('alt' in detail && typeof detail.alt === 'string' && { alt: detail.alt }),
      ...('summary' in detail && typeof detail.summary === 'string' && { summary: detail.summary }),
    };
  } catch {
    return;
  }
}
