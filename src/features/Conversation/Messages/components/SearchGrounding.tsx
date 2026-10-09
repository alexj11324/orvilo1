import { SearchResultCards } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronDown, ChevronRight, Globe, Images } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { useIsDark } from '@/hooks/useIsDark';
import Image from '@/libs/next/Image';
import { type GroundingSearch } from '@/types/search';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

// Resolve the favicon host defensively: some providers (e.g. OpenRouter built-in
// web search) may emit citations with an empty/invalid url, and `new URL(undefined)`
// would throw and crash the whole message render.
const getFaviconHost = (favicon?: string, url?: string): string => {
  if (favicon) return favicon;
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

const stripHtml = (html: string) =>
  html
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    width: fit-content;
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 6px;

    color: ${cssVar.colorTextTertiary};
  `,
  containerDark: css`
    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  containerLight: css`
    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  expandDark: css`
    background: ${cssVar.colorFillQuaternary} !important;
  `,
  expandLight: css`
    background: ${cssVar.colorFillTertiary} !important;
  `,
  imageCard: css`
    overflow: hidden;
    border-radius: 8px;
  `,
  imageCardLink: css`
    color: inherit;
    text-decoration: none;
    transition: opacity 0.2s;

    &:hover {
      opacity: 0.75;
    }
  `,
  imageDomain: css`
    overflow: hidden;

    font-size: 11px;
    line-height: 1;
    color: ${cssVar.colorTextQuaternary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  imageGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  `,
  imageThumb: css`
    display: block;
    width: 100%;
    height: 80px;
    object-fit: cover;
  `,
  imageThumbWrap: css`
    overflow: hidden;
    display: block;
    flex-shrink: 0;

    height: 80px;
    border-radius: 6px;
  `,
  imageTitle: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 11px;
    line-height: 1.4;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-size: 12px;
    text-overflow: ellipsis;
  `,
}));

const SearchGrounding = memo<GroundingSearch>(
  ({ searchQueries, citations, imageResults, imageSearchQueries }) => {
    const { t } = useTranslation('chat');
    const isDarkMode = useIsDark();

    const [showDetail, setShowDetail] = useState(false);

    // Drop citations without a valid url so a malformed entry can't crash the render
    const validCitations = citations?.filter((item) => !!item.url);

    const hasWebResults = !!validCitations?.length;
    const hasImageResults = !!imageResults?.length;
    const titleIcon = !hasWebResults && hasImageResults ? Images : Globe;
    const titleText = hasWebResults
      ? t('search.grounding.title', { count: validCitations?.length })
      : t('search.grounding.imageTitle', { count: imageResults?.length });

    return (
      <div
        style={{ width: showDetail ? '100%' : undefined }}
        className={cn(
          'flex flex-col gap-4',
          cx(
            styles.container,
            isDarkMode ? styles.containerDark : styles.containerLight,
            showDetail && (isDarkMode ? styles.expandDark : styles.expandLight),
          ),
        )}
      >
        <div
          {...clickableProps()}
          className={cn('flex justify-between flex-1 gap-2', CLICKABLE_FOCUS_RING)}
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setShowDetail(!showDetail);
          }}
        >
          <div className="flex items-center gap-2">
            {createElement(titleIcon, {})}
            <div className="flex">{titleText}</div>
            {!showDetail && hasWebResults && (
              <div className="flex">
                {validCitations?.slice(0, 8).map((item, index) => (
                  <Image
                    unoptimized
                    alt={item.title || item.url}
                    height={16}
                    key={`${item.url}-${index}`}
                    src={`https://icons.duckduckgo.com/ip3/${getFaviconHost(item.favicon, item.url)}.ico`}
                    width={16}
                    style={{
                      background: cssVar.colorBgContainer,
                      borderRadius: 8,
                      marginInline: -2,
                      padding: 2,
                      zIndex: 100 - index,
                    }}
                  />
                ))}
              </div>
            )}
            {!showDetail && !hasWebResults && hasImageResults && (
              <div className="flex">
                {imageResults?.slice(0, 8).map((item, index) => (
                  <Image
                    unoptimized
                    alt={item.domain || ''}
                    height={16}
                    key={`${item.domain}-${index}`}
                    src={`https://icons.duckduckgo.com/ip3/${item.domain || ''}.ico`}
                    width={16}
                    style={{
                      background: cssVar.colorBgContainer,
                      borderRadius: 8,
                      marginInline: -2,
                      padding: 2,
                      zIndex: 100 - index,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-1">
            {createElement(showDetail ? ChevronDown : ChevronRight, {})}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showDetail && (
            <m.div
              animate="open"
              exit="collapsed"
              initial="collapsed"
              style={{ overflow: 'hidden', width: '100%' }}
              transition={{
                duration: 0.2,
                ease: [0.4, 0, 0.2, 1], // Using ease-out easing function
              }}
              variants={{
                collapsed: { height: 0, opacity: 0, width: 'auto' },
                open: { height: 'auto', opacity: 1, width: 'auto' },
              }}
            >
              <div className="flex flex-col gap-3">
                {searchQueries && (
                  <div className="flex gap-1">
                    {t('search.grounding.searchQueries')}
                    <div className="flex gap-2">
                      {searchQueries.map((query, index) => (
                        <Badge key={index}>{query}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {validCitations && (
                  <SearchResultCards
                    dataSource={validCitations.map((c) => ({
                      ...c,
                      // Pass the original redirect URL as href to preserve the actual link
                      href: c.url,
                      // Override url with favicon domain so SearchResultCard derives the correct favicon host
                      url: c.favicon ? `https://${c.favicon}` : c.url,
                    }))}
                  />
                )}
                {imageSearchQueries && imageSearchQueries.length > 0 && (
                  <div className="flex gap-1">
                    {t('search.grounding.imageSearchQueries')}
                    <div className="flex gap-2 flex-wrap">
                      {imageSearchQueries.map((query, index) => (
                        <Badge key={index}>{query}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {imageResults && imageResults.length > 0 && (
                  <div className={styles.imageGrid}>
                    {imageResults.map((item, index) => (
                      <div className={styles.imageCard} key={`${item.imageUri}-${index}`}>
                        <div className="flex flex-col gap-1">
                          <a
                            className={styles.imageCardLink}
                            href={item.imageUri}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <div className={styles.imageThumbWrap}>
                              <img
                                alt={item.title ? stripHtml(item.title) : ''}
                                className={styles.imageThumb}
                                src={item.imageUri || ''}
                              />
                            </div>
                          </a>
                          <a
                            className={styles.imageCardLink}
                            href={item.sourceUri}
                            rel="noopener noreferrer"
                            target="_blank"
                            title={item.title ? stripHtml(item.title) : undefined}
                          >
                            <div className="flex flex-col gap-0.5">
                              {item.title && (
                                <div className={styles.imageTitle}>{stripHtml(item.title)}</div>
                              )}
                              {item.domain && (
                                <div className="flex items-center gap-1">
                                  <Image
                                    unoptimized
                                    alt={item.domain}
                                    height={12}
                                    src={`https://icons.duckduckgo.com/ip3/${item.domain}.ico`}
                                    style={{ borderRadius: 2, flexShrink: 0 }}
                                    width={12}
                                  />
                                  <div className={styles.imageDomain}>{item.domain}</div>
                                </div>
                              )}
                            </div>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

export default SearchGrounding;
