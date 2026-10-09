import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Badge } from '@/components/reui/badge';
import { type GroundingSearch } from '@/types/search';

const stripHtml = (html: string) =>
  html
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');

const SearchGrounding = memo<GroundingSearch>(
  ({ searchQueries, citations, imageResults, imageSearchQueries }) => {
    const { t } = useTranslation('chat');
    const validCitations = citations?.filter((item) => !!item.url) ?? [];
    const hasWebResults = validCitations.length > 0;
    const hasImageResults = !!imageResults?.length;
    if (!hasWebResults && !hasImageResults && !searchQueries?.length && !imageSearchQueries?.length)
      return null;
    const count = hasWebResults ? validCitations.length : (imageResults?.length ?? 0);
    return (
      <Sources>
        <SourcesTrigger
          count={count}
          label={t(hasWebResults ? 'search.grounding.title' : 'search.grounding.imageTitle', {
            count,
          })}
        />
        <SourcesContent>
          {!!searchQueries?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <span>{t('search.grounding.searchQueries')}</span>
              {searchQueries.map((query, index) => (
                <Badge key={index} variant="secondary">
                  {query}
                </Badge>
              ))}
            </div>
          )}
          {validCitations.map((citation, index) => (
            <div className="flex flex-wrap items-center gap-1" key={`${citation.url}-${index}`}>
              <Source href={citation.url} title={citation.title || citation.url} />
              <InlineCitationCard>
                <InlineCitationCardTrigger sources={[citation.url]} />
                <InlineCitationCardBody>
                  <InlineCitationCarousel>
                    <InlineCitationCarouselContent>
                      <InlineCitationCarouselItem>
                        <InlineCitationSource title={citation.title} url={citation.url} />
                      </InlineCitationCarouselItem>
                    </InlineCitationCarouselContent>
                  </InlineCitationCarousel>
                </InlineCitationCardBody>
              </InlineCitationCard>
            </div>
          ))}
          {!!imageSearchQueries?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <span>{t('search.grounding.imageSearchQueries')}</span>
              {imageSearchQueries.map((query, index) => (
                <Badge key={index} variant="secondary">
                  {query}
                </Badge>
              ))}
            </div>
          )}
          {!!imageResults?.length && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              {imageResults.map((item, index) => (
                <div
                  className="flex flex-col gap-1 overflow-hidden rounded-lg"
                  key={`${item.imageUri}-${index}`}
                >
                  <a
                    className="block overflow-hidden rounded-md hover:opacity-75"
                    href={item.imageUri}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <img
                      alt={item.title ? stripHtml(item.title) : ''}
                      className="h-20 w-full object-cover"
                      src={item.imageUri || ''}
                    />
                  </a>
                  <Source
                    className="flex flex-col items-start gap-0.5"
                    href={item.sourceUri}
                    title={item.title ? stripHtml(item.title) : item.domain}
                  >
                    {item.title && (
                      <span className="line-clamp-2 text-xs text-foreground">
                        {stripHtml(item.title)}
                      </span>
                    )}
                    {item.domain && (
                      <span className="truncate text-xs text-muted-foreground">{item.domain}</span>
                    )}
                  </Source>
                </div>
              ))}
            </div>
          )}
        </SourcesContent>
      </Sources>
    );
  },
);

export default SearchGrounding;
