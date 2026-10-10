'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import type { SearchMemoryParams, SearchUserMemoryState } from '../../../types';

const styles = {
  container:
    'overflow-hidden w-full border border-sidebar-border rounded-(--radius-overlay) bg-card',
  empty: 'p-6 text-(--ant-color-text-tertiary) text-center',
  item: '[padding-block:10px] [padding-inline:12px] [border-block-end:1px_dashed_var(--sidebar-border)] last:[border-block-end:none]',
  itemContent: 'text-[13px] leading-[1.5] text-muted-foreground',
  itemTitle: 'text-sm leading-[inherit] font-medium text-foreground',
  sectionHeader: 'text-xs leading-[inherit] font-medium',
  tags: '[padding-block-start:6px]',
};

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
        <div
          className={`text-muted-foreground ${styles.itemContent}`}
          style={{ fontStyle: 'italic' }}
        >
          {subContent}
        </div>
      )}
      {safeTags.length > 0 && (
        <div className={cn('flex', 'gap-1', 'flex-wrap', styles.tags)}>
          {safeTags.map((tag, index) => (
            <Badge key={index} size="sm">
              {tag}
            </Badge>
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
                <div className={styles.sectionHeader}>
                  <span>Activities</span>
                  <span className="text-muted-foreground"> ({activities.length})</span>
                </div>
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
                <div className={styles.sectionHeader}>
                  <span>{t('builtins.orvilo-user-memory.render.contexts')}</span>
                  <span className="text-muted-foreground"> ({contexts.length})</span>
                </div>
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
                <div className={styles.sectionHeader}>
                  <span>{t('builtins.orvilo-user-memory.render.experiences')}</span>
                  <span className="text-muted-foreground"> ({experiences.length})</span>
                </div>
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
                <div className={styles.sectionHeader}>
                  <span>Identities</span>
                  <span className="text-muted-foreground"> ({identities.length})</span>
                </div>
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
                <div className={styles.sectionHeader}>
                  <span>{t('builtins.orvilo-user-memory.render.preferences')}</span>
                  <span className="text-muted-foreground"> ({preferences.length})</span>
                </div>
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
