'use client';

import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import SearchBar from '@/components/SearchBar';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  apiDesc: 'line-clamp-2 text-xs text-foreground-tertiary',
  apiHeader: 'flex min-h-9 cursor-pointer items-center justify-between rounded-(--radius-button)',
  apiTitle: 'font-mono text-sm',
  emptyState: 'p-8 text-center text-sm leading-5.5 text-muted-foreground',
  header: 'flex items-center gap-2 mbe-6',
  paramDesc: 'text-xs text-muted-foreground',
  paramGrid: 'grid grid-cols-[1fr_2fr] items-center gap-3 mbe-3',
  paramName: 'flex items-center gap-1.5 font-mono text-sm leading-5.5',
  params: 'text-sm leading-5.5 text-muted-foreground',
  required: 'ms-0.5 text-destructive-text',
  searchIcon: 'absolute z-1 inset-bs-1/2 start-3 -translate-y-1/2 text-muted-foreground',
  searchWrapper: 'relative',
  typeTag: 'h-5 px-1.5 py-0 text-xs rounded-(--radius-chip)',
};

interface ApiItemProps {
  api: {
    description: string;
    name: string;
    parameters: {
      properties: Record<string, { description: string; type: string }>;
      required: string[];
    };
  };
}

const ApiItem = memo<ApiItemProps>(({ api }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation('plugin');

  const params = Object.entries(api.parameters.properties || {});
  return (
    <div className="flex flex-col gap-2 p-4">
      <div
        {...clickableProps()}
        className={cn(styles.apiHeader, CLICKABLE_FOCUS_RING)}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col gap-2">
          <div className={styles.apiTitle}>{api.name}</div>
          <div className={styles.apiDesc}>{api.description}</div>
        </div>

        <span className="anticon" role="img">
          {createElement(expanded ? ChevronDown : ChevronRight, {
            size: 16,
            width: 16,
            height: 16,
            fill: 'transparent',
          })}
        </span>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-(--radius-card) bg-fill-quaternary p-4">
          {params.length === 0 ? (
            <div className={styles.params}>{t('dev.preview.api.noParams')}</div>
          ) : (
            <>
              <div className={styles.params}>{t('dev.preview.api.params')}</div>
              <div className="flex flex-col gap-2 w-full">
                {params.map(([name, param]) => {
                  const isRequired = api.parameters.required?.includes(name);
                  return (
                    <div className={styles.paramGrid} key={name}>
                      <div className={styles.paramName}>
                        <span>{name}</span>
                        {isRequired && <span className={styles.required}>*</span>}
                        <Badge className={styles.typeTag} variant="secondary">
                          {param.type}
                        </Badge>
                      </div>
                      <div className={styles.paramDesc}>{param.description}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

interface ApiVisualizerProps {
  apis: ApiItemProps['api'][];
}

const ApiVisualizer = memo<ApiVisualizerProps>(({ apis = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation('plugin');

  const filteredApis = apis.filter(
    (api) =>
      api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className={styles.searchWrapper}>
        <SearchBar
          placeholder={t('dev.preview.api.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 w-full">
        {filteredApis.length > 0 ? (
          filteredApis.map((api, index) => <ApiItem api={api} key={index} />)
        ) : (
          <div className={styles.emptyState}>{t('dev.preview.api.noResults')}</div>
        )}
      </div>
    </div>
  );
});

export default ApiVisualizer;
