'use client';

import { Tag, Text } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import type { SearchMemoryParams, SearchUserMemoryState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  empty: css`
    padding: 24px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  item: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px dashed ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }
  `,
  itemContent: css`
    font-size: 13px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
  `,
  itemTitle: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  sectionHeader: css`
    font-size: 12px;
    font-weight: 500;
  `,
  tags: css`
    padding-block-start: 6px;
  `,
}));

interface MemoryItemProps {
  content?: string | null;
  subContent?: string | null;
  tags?: string[] | null;
  title?: string | null;
}

const MemoryItem = memo<MemoryItemProps>(({ title, content, subContent, tags }) => {
  // Guard against non-array `tags` (dirty data) so a bad row can't crash the list.
  const safeTags = Array.isArray(tags) ? tags : [];
  return (
    <div className={cn('flex', 'flex-col', 'gap-1', styles.item)}>
      {title && <div className={styles.itemTitle}>{title}</div>}
      {content && <div className={styles.itemContent}>{content}</div>}
      {subContent && (
        <Text className={styles.itemContent} style={{ fontStyle: 'italic' }} type={'secondary'}>
          {subContent}
        </Text>
      )}
      {safeTags.length > 0 && (
        <div className={cn('flex', 'gap-1', 'flex-wrap', styles.tags)}>
          {safeTags.map((tag, index) => (
            <Tag key={index} size={'small'}>
              {tag}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
});

MemoryItem.displayName = 'MemoryItem';

const SearchUserMemoryRender = memo<BuiltinRenderProps<SearchMemoryParams, SearchUserMemoryState>>(
  ({ pluginState }) => {
    const { t } = useTranslation('plugin');

    const activities = pluginState?.activities || [];
    const contexts = pluginState?.contexts || [];
    const experiences = pluginState?.experiences || [];
    const identities = pluginState?.identities || [];
    const preferences = pluginState?.preferences || [];

    const totalCount =
      activities.length +
      contexts.length +
      experiences.length +
      identities.length +
      preferences.length;

    if (totalCount === 0) {
      return (
        <div className={styles.container}>
          <div className={styles.empty}>{t('builtins.orvilo-user-memory.inspector.noResults')}</div>
        </div>
      );
    }

    const defaultActiveKeys = [
      ...(activities.length > 0 ? ['activities'] : []),
      ...(contexts.length > 0 ? ['contexts'] : []),
      ...(experiences.length > 0 ? ['experiences'] : []),
      ...(identities.length > 0 ? ['identities'] : []),
      ...(preferences.length > 0 ? ['preferences'] : []),
    ];

    return (
      <div className={cn('flex', 'flex-col', styles.container)}>
        <Accordion defaultValue={defaultActiveKeys}>
          {activities.length > 0 && (
            <AccordionItem value="activities">
              <AccordionTrigger>
                <Text className={styles.sectionHeader}>
                  <span>Activities</span>
                  <Text as={'span'} type={'secondary'}>
                    {' '}
                    ({activities.length})
                  </Text>
                </Text>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col">
                  {activities.map((item) => (
                    <MemoryItem
                      content={item.narrative}
                      key={item.id}
                      subContent={item.feedback}
                      tags={item.tags}
                      title={item.notes || item.type}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Contexts */}
          {contexts.length > 0 && (
            <AccordionItem value="contexts">
              <AccordionTrigger>
                <Text className={styles.sectionHeader}>
                  <span>{t('builtins.orvilo-user-memory.render.contexts')}</span>
                  <Text as={'span'} type={'secondary'}>
                    {' '}
                    ({contexts.length})
                  </Text>
                </Text>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col">
                  {contexts.map((item) => (
                    <MemoryItem
                      content={item.description}
                      key={item.id}
                      subContent={item.currentStatus}
                      tags={item.tags}
                      title={item.title}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Experiences */}
          {experiences.length > 0 && (
            <AccordionItem value="experiences">
              <AccordionTrigger>
                <Text className={styles.sectionHeader}>
                  <span>{t('builtins.orvilo-user-memory.render.experiences')}</span>
                  <Text as={'span'} type={'secondary'}>
                    {' '}
                    ({experiences.length})
                  </Text>
                </Text>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col">
                  {experiences.map((item) => (
                    <MemoryItem
                      content={item.situation}
                      key={item.id}
                      subContent={item.keyLearning}
                      tags={item.tags}
                      title={item.action}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Preferences */}
          {identities.length > 0 && (
            <AccordionItem value="identities">
              <AccordionTrigger>
                <Text className={styles.sectionHeader}>
                  <span>Identities</span>
                  <Text as={'span'} type={'secondary'}>
                    {' '}
                    ({identities.length})
                  </Text>
                </Text>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col">
                  {identities.map((item) => (
                    <MemoryItem
                      content={item.description}
                      key={item.id}
                      subContent={item.role}
                      tags={item.tags}
                      title={item.relationship || item.type}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {preferences.length > 0 && (
            <AccordionItem value="preferences">
              <AccordionTrigger>
                <Text className={styles.sectionHeader}>
                  <span>{t('builtins.orvilo-user-memory.render.preferences')}</span>
                  <Text as={'span'} type={'secondary'}>
                    {' '}
                    ({preferences.length})
                  </Text>
                </Text>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col">
                  {preferences.map((item) => (
                    <MemoryItem
                      content={item.conclusionDirectives}
                      key={item.id}
                      subContent={item.suggestions}
                      tags={item.tags}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    );
  },
);

SearchUserMemoryRender.displayName = 'SearchUserMemoryRender';

export default SearchUserMemoryRender;
