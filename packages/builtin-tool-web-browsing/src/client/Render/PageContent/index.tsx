import type { CrawlPluginState } from '@orvilo/types';
import type { CrawlErrorResult } from '@orvilo/web-crawler';
import { memo } from 'react';

import Loading from './Loading';
import Result from './Result';

interface PagesContentProps {
  messageId: string;
  results?: CrawlPluginState['results'];
  urls?: string[];
}

const PagesContent = memo<PagesContentProps>(({ results, messageId, urls = [] }) => {
  if (!results || results.length === 0) {
    return (
      <div className="flex flex-row gap-2">
        {urls &&
          urls.length > 0 &&
          urls.map((url, index) => <Loading key={`${url}_${index}`} url={url} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-row gap-2 overflow-x-auto">
      {results.map((result) => (
        <Result
          crawler={result.crawler}
          key={result.originalUrl}
          messageId={messageId}
          originalUrl={result.originalUrl}
          result={
            result.data ||
            // TODO: Remove this in v2 as it's deprecated
            ({
              content: (result as any)?.content,
              errorMessage: (result as any)?.errorMessage,
              errorType: (result as any)?.errorType,
              url: result.originalUrl,
            } as CrawlErrorResult)
          }
        />
      ))}
    </div>
  );
});

export default PagesContent;
