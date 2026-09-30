'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SearchBar from '@/components/SearchBar';

const styles = createStaticStyles(({ css }) => ({
  apiDesc: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  apiHeader: css`
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `,
  apiTitle: css`
    font-family: ${cssVar.fontFamilyCode};
  `,

  emptyState: css`
    padding: 32px;
    color: ${cssVar.colorTextDisabled};
    text-align: center;
  `,
  header: css`
    display: flex;
    gap: 8px;
    align-items: center;
    margin-block-end: 24px;
  `,
  paramDesc: css`
    font-size: 12px;
    line-height: 18px;
    color: ${cssVar.colorTextSecondary};
  `,
  paramGrid: css`
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 12px;
    align-items: center;

    margin-block-end: 12px;
  `,
  paramName: css`
    display: flex;
    gap: 6px;
    align-items: center;
    font-family: monospace;
  `,
  params: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  required: css`
    margin-inline-start: 2px;
    color: ${cssVar.colorError};
  `,
  searchIcon: css`
    position: absolute;
    z-index: 1;
    inset-block-start: 50%;
    inset-inline-start: 12px;
    transform: translateY(-50%);

    color: ${cssVar.colorTextSecondary};
  `,
  searchWrapper: css`
    position: relative;
  `,
  typeTag: css`
    height: 20px;
    padding-block: 0;
    padding-inline: 6px;

    font-size: 12px;
    line-height: 20px;
  `,
}));

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
      <div className={styles.apiHeader} onClick={() => setExpanded(!expanded)}>
        <div className="flex flex-col gap-2">
          <div className={styles.apiTitle}>{api.name}</div>
          <div className={styles.apiDesc}>{api.description}</div>
        </div>

        <span className="anticon" role="img">
          {createElement(expanded ? ChevronDown : ChevronRight, {
            size: '1em',
            width: '1em',
            height: '1em',
            fill: 'transparent',
          })}
        </span>
      </div>

      {expanded && (
        <div
          className="flex flex-col gap-3 p-4"
          style={{ background: cssVar.colorFillQuaternary, borderRadius: 6 }}
        >
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
    <div className="flex flex-col gap-2 w-[100%]">
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
