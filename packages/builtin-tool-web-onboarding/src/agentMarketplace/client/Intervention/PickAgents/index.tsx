'use client';

import type { BuiltinInterventionProps } from '@orvilo/types';
import { cn } from 'cn';
import type { KeyboardEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  fetchAgentTemplates,
  getAgentTemplatesSWRKey,
  getTemplatesByCategoryPriority,
} from '../../../data/agent-templates';
import type { AgentTemplate, MarketplaceCategory, ShowAgentMarketplaceArgs } from '../../../types';
import { CATEGORY_LABEL_I18N_KEYS } from './constants';
import PickAgentsSkeleton from './Skeleton';
import { styles } from './style';

const EMPTY_TEMPLATES: AgentTemplate[] = [];

const PickAgentsIntervention = memo<BuiltinInterventionProps<ShowAgentMarketplaceArgs>>(
  ({ args, disabled = false, interactionMode, onInteractionAction }) => {
    const { t } = useTranslation('ui');
    const { t: tTool } = useTranslation('tool');
    const isCustom = interactionMode === 'custom';

    const { categoryHints, description, prompt } = args;

    const { i18n } = useTranslation();
    const swrLocale = i18n.resolvedLanguage || i18n.language;

    const {
      data: allTemplates = EMPTY_TEMPLATES,
      isLoading,
      error,
    } = useSWR(getAgentTemplatesSWRKey(swrLocale), () => fetchAgentTemplates(), {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

    useEffect(() => {
      if (error) console.error('[AgentMarketplace] failed to load templates', error);
    }, [error]);

    const templates = useMemo(
      () => getTemplatesByCategoryPriority(allTemplates, categoryHints ?? []),
      [allTemplates, categoryHints],
    );

    const groupedTemplates = useMemo(() => {
      const map = new Map<MarketplaceCategory, AgentTemplate[]>();
      for (const tpl of templates) {
        const list = map.get(tpl.category);
        if (list) list.push(tpl);
        else map.set(tpl.category, [tpl]);
      }
      return map;
    }, [templates]);

    const availableCategories = useMemo(() => [...groupedTemplates.keys()], [groupedTemplates]);

    const [activeCategory, setActiveCategory] = useState<MarketplaceCategory | undefined>(
      () => availableCategories[0],
    );

    useEffect(() => {
      if (!activeCategory || !groupedTemplates.has(activeCategory)) {
        setActiveCategory(availableCategories[0]);
      }
    }, [activeCategory, availableCategories, groupedTemplates]);

    const visibleTemplates = useMemo(
      () => (activeCategory ? (groupedTemplates.get(activeCategory) ?? []) : []),
      [activeCategory, groupedTemplates],
    );

    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [submitting, setSubmitting] = useState(false);

    const toggle = useCallback(
      (id: string) => {
        if (disabled) return;
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      [disabled],
    );

    const handleSubmit = useCallback(async () => {
      if (!onInteractionAction || selected.size === 0 || disabled) return;
      setSubmitting(true);
      try {
        await onInteractionAction({
          payload: { categoryHints, requestId: args.requestId, selectedTemplateIds: [...selected] },
          type: 'submit',
        });
      } catch (error) {
        console.error('[AgentMarketplace] submit failed', error);
      } finally {
        setSubmitting(false);
      }
    }, [args.requestId, categoryHints, disabled, onInteractionAction, selected]);

    const handleSkip = useCallback(async () => {
      if (!onInteractionAction || disabled) return;
      await onInteractionAction({
        payload: { categoryHints, requestId: args.requestId },
        type: 'skip',
      });
    }, [args.requestId, categoryHints, disabled, onInteractionAction]);

    const handleCardKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>, id: string) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle(id);
        }
      },
      [disabled, toggle],
    );

    if (!isCustom) {
      return (
        <div className="flex flex-col gap-2">
          <div>{prompt}</div>
          {description && (
            <div className="text-sm leading-5.5 text-muted-foreground">{description}</div>
          )}
          <div className="text-xs leading-5 text-muted-foreground">
            {tTool('agentMarketplace.picker.summary', {
              filtered: templates.length,
              total: allTemplates.length,
            })}
          </div>
        </div>
      );
    }

    const showLoading = isLoading && allTemplates.length === 0;
    const showEmpty = !isLoading && visibleTemplates.length === 0;

    return (
      <div className={cn('flex', 'flex-col', 'gap-3', styles.root)}>
        <div className={styles.header}>
          <div className="text-sm leading-5.5 font-medium">{prompt}</div>
          {description && (
            <div className="text-sm leading-5.5 text-muted-foreground">{description}</div>
          )}
        </div>

        {showLoading ? (
          <PickAgentsSkeleton />
        ) : showEmpty ? (
          <div className={styles.empty}>
            {error
              ? tTool('agentMarketplace.picker.failedToLoad')
              : tTool('agentMarketplace.picker.empty')}
          </div>
        ) : (
          <Tabs
            className={styles.container}
            value={activeCategory ?? ''}
            onValueChange={(value) => {
              const category = availableCategories.find((item) => item === value);
              if (category) setActiveCategory(category);
            }}
          >
            <TabsList className={styles.tabBar}>
              {availableCategories.map((category) => (
                <TabsTrigger
                  className={styles.categoryItem}
                  disabled={disabled}
                  key={category}
                  value={category}
                >
                  {tTool(CATEGORY_LABEL_I18N_KEYS[category])}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent className={styles.content} value={activeCategory ?? ''}>
              {visibleTemplates.length === 0 ? (
                <div className={styles.empty}>{tTool('agentMarketplace.picker.empty')}</div>
              ) : (
                <div className={styles.grid}>
                  {visibleTemplates.map((tpl) => {
                    const isSelected = selected.has(tpl.id);
                    const avatar = tpl.avatar;
                    return (
                      <div
                        aria-disabled={disabled}
                        aria-pressed={isSelected}
                        key={tpl.id}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        className={cn(
                          styles.card,
                          isSelected
                            ? 'border-primary bg-selected hover:bg-selected'
                            : 'border-divider bg-card hover:border-primary-hover',
                        )}
                        onClick={() => toggle(tpl.id)}
                        onKeyDown={(event) => handleCardKeyDown(event, tpl.id)}
                      >
                        <div className={styles.cardHeader}>
                          <Avatar avatar={avatar} shape="square" size={36} />
                          <div className={styles.cardTitle}>{tpl.title}</div>
                        </div>
                        {tpl.description && (
                          <div className={styles.cardDescription}>{tpl.description}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className={styles.footer}>
          <Button
            className={styles.skipLink}
            disabled={disabled}
            size="normal"
            type="button"
            variant="ghost"
            onClick={handleSkip}
          >
            {t('form.skip')}
          </Button>
          <Button
            disabled={disabled || selected.size === 0}
            loading={submitting}
            size="normal"
            type="button"
            variant="default"
            onClick={handleSubmit}
          >
            {`${t('common.confirm')} (${selected.size})`}
          </Button>
        </div>
      </div>
    );
  },
);

PickAgentsIntervention.displayName = 'PickAgentsIntervention';

export default PickAgentsIntervention;
