'use client';

import { cn } from 'cn';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge } from '@/components/reui/badge';
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
} from '@/components/reui/stepper';
import StreamingMarkdown from '@/components/StreamingMarkdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { highlightTextStyles } from '@/styles';

import type { AddPreferenceMemoryParams } from '../../types';

const styles = {
  container: 'overflow-hidden w-full border border-sidebar-border rounded-[16px] bg-card',
  content: '[padding-block:12px] [padding-inline:16px]',
  detail: 'text-[13px] leading-[1.6] text-muted-foreground',
  directive: 'text-sm leading-[1.6] text-foreground',
  header:
    '[padding-block:10px] [padding-inline:12px] [border-block-end:1px_solid_var(--sidebar-border)]',
  section: 'p-1 [border-block-start:1px_solid_var(--sidebar-border)]',
  stepContent: 'text-[13px] leading-[1.6] text-muted-foreground whitespace-pre-wrap',
  suggestion:
    '[padding-block:8px] [padding-inline:12px] rounded-(--radius-card) text-[13px] leading-[1.5] text-muted-foreground bg-(--ant-color-fill-quaternary)',
  summary: 'text-sm leading-[inherit] font-medium text-muted-foreground',
  tags: '[padding-block-start:8px] [border-block-start:1px_dashed_var(--sidebar-border)]',
  title: 'line-clamp-1 font-medium text-foreground',
};

export interface PreferenceMemoryCardProps {
  data?: AddPreferenceMemoryParams;
  loading?: boolean;
}

export const PreferenceMemoryCard = memo<PreferenceMemoryCardProps>(({ data, loading }) => {
  const { summary, details, tags, title, withPreference } = data || {};
  const { conclusionDirectives, originContext, appContext, suggestions, type } =
    withPreference || {};

  // `tags`/`suggestions` come from raw model tool-call args without zod coercion,
  // so a model may emit a scalar where `string[]` is expected. Normalize to arrays
  // to keep this card from crashing on dirty input (`.map` on a non-array).
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];

  const hasContextContent =
    originContext?.actor ||
    originContext?.scenario ||
    originContext?.trigger ||
    originContext?.applicableWhen ||
    originContext?.notApplicableWhen;

  const hasAppContext = appContext?.app || appContext?.feature || appContext?.surface;

  const hasSuggestions = safeSuggestions.length > 0;

  if (
    !summary &&
    !details &&
    !safeTags.length &&
    !title &&
    !conclusionDirectives &&
    !hasContextContent &&
    !hasSuggestions
  )
    return null;

  const contextItems = [
    { avatar: '👤', content: originContext?.actor, title: 'Actor' },
    { avatar: '🎯', content: originContext?.scenario, title: 'Scenario' },
    { avatar: '⚡', content: originContext?.trigger, title: 'Trigger' },
    { avatar: '✅', content: originContext?.applicableWhen, title: 'Applicable When' },
    { avatar: '❌', content: originContext?.notApplicableWhen, title: 'Not Applicable When' },
  ].filter((item) => item.content);

  const appContextItems = [
    { avatar: '📱', content: appContext?.app, title: 'App' },
    { avatar: '🔧', content: appContext?.feature, title: 'Feature' },
    { avatar: '📍', content: appContext?.surface, title: 'Surface' },
  ].filter((item) => item.content);

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      {/* Header */}
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <div className="flex flex-col flex-1">
          <div className={styles.title}>{title || 'Preference Memory'}</div>
        </div>
        {type && <Badge>{type}</Badge>}
        {loading && <NeuralNetworkLoading size={20} />}
      </div>

      {/* When has context content: collapse summary */}
      {hasContextContent || hasAppContext ? (
        <>
          {/* Collapsed Summary */}
          {(summary || safeTags.length > 0) && (
            <Accordion>
              <AccordionItem value="summary">
                <AccordionTrigger>
                  <div className="text-[12px] text-muted-foreground font-medium">Summary</div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2 px-2" style={{ paddingBlock: '8px 12px' }}>
                    {summary && <div className={styles.summary}>{summary}</div>}
                    {details && <div className={styles.detail}>{details}</div>}
                    {safeTags.length > 0 && (
                      <div className={cn('flex', 'gap-2', 'flex-wrap', styles.tags)}>
                        {safeTags.map((tag, index) => (
                          <Badge key={index}>{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Origin Context Steps */}
          {hasContextContent && (
            <Accordion className={styles.section} defaultValue={['context']}>
              <AccordionItem value="context">
                <AccordionTrigger>
                  <div className="text-[12px] text-muted-foreground font-medium">
                    Origin Context
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col px-2" style={{ paddingBlock: '8px 12px' }}>
                    <Stepper orientation="vertical" value={0}>
                      <StepperNav>
                        {contextItems.map((item, index) => (
                          <StepperItem
                            className="w-full items-start"
                            key={item.title}
                            step={index + 1}
                          >
                            <div className="flex items-start gap-2">
                              <StepperIndicator className="size-5 rounded-md">
                                <Avatar
                                  shadow
                                  avatar={item.avatar}
                                  shape={'square'}
                                  size={20}
                                  style={{
                                    border: '1px solid var(--sidebar-border)',
                                    fontSize: 11,
                                  }}
                                />
                              </StepperIndicator>
                              <div className="flex flex-col gap-1">
                                <StepperTitle>
                                  <span className="text-[12px] text-muted-foreground font-medium">
                                    {item.title}
                                  </span>
                                </StepperTitle>
                                <StepperDescription>
                                  <div className={styles.stepContent}>{item.content}</div>
                                </StepperDescription>
                              </div>
                            </div>
                            {index < contextItems.length - 1 && (
                              <StepperSeparator className="h-4" />
                            )}
                          </StepperItem>
                        ))}
                      </StepperNav>
                    </Stepper>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* App Context */}
          {hasAppContext && (
            <Accordion className={styles.section}>
              <AccordionItem value="appContext">
                <AccordionTrigger>
                  <div className="text-[12px] text-muted-foreground font-medium">App Context</div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col px-2" style={{ paddingBlock: '8px 12px' }}>
                    <Stepper orientation="vertical" value={0}>
                      <StepperNav>
                        {appContextItems.map((item, index) => (
                          <StepperItem
                            className="w-full items-start"
                            key={item.title}
                            step={index + 1}
                          >
                            <div className="flex items-start gap-2">
                              <StepperIndicator className="size-5 rounded-md">
                                <Avatar
                                  shadow
                                  avatar={item.avatar}
                                  shape={'square'}
                                  size={20}
                                  style={{
                                    border: '1px solid var(--sidebar-border)',
                                    fontSize: 11,
                                  }}
                                />
                              </StepperIndicator>
                              <div className="flex flex-col gap-1">
                                <StepperTitle>
                                  <span className="text-[12px] text-muted-foreground font-medium">
                                    {item.title}
                                  </span>
                                </StepperTitle>
                                <StepperDescription>
                                  <div className={styles.stepContent}>{item.content}</div>
                                </StepperDescription>
                              </div>
                            </div>
                            {index < appContextItems.length - 1 && (
                              <StepperSeparator className="h-4" />
                            )}
                          </StepperItem>
                        ))}
                      </StepperNav>
                    </Stepper>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Conclusion Directive */}
          {conclusionDirectives && (
            <div
              className={cn('flex', 'flex-col', 'gap-2', styles.section)}
              style={{ paddingBlock: 16, paddingInline: 12 }}
            >
              <div className="text-[12px] font-medium">
                <span className={highlightTextStyles.primary}>Directive</span>
              </div>
              <div className={styles.directive}>{conclusionDirectives}</div>
            </div>
          )}

          {/* Suggestions */}
          {hasSuggestions && (
            <div
              className={cn('flex', 'flex-col', 'gap-2', styles.section)}
              style={{ paddingBlock: 16, paddingInline: 12 }}
            >
              <div className="text-[12px] font-medium">
                <span className={highlightTextStyles.info}>Suggestions</span>
              </div>
              <div className="flex flex-col gap-2">
                {safeSuggestions.map((suggestion, index) => (
                  <div className={styles.suggestion} key={index}>
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* When no context content: show summary and details */
        <div className={cn('flex', 'flex-col', 'gap-2', styles.content)}>
          {!summary && loading ? (
            <BubblesLoading />
          ) : (
            <>
              {summary && <div className={styles.summary}>{summary}</div>}
              {details && <StreamingMarkdown>{details}</StreamingMarkdown>}
              {conclusionDirectives && (
                <div className="flex flex-col gap-1 py-2">
                  <div className="text-[12px] font-medium">
                    <span className={highlightTextStyles.primary}>Directive</span>
                  </div>
                  <div className={styles.directive}>{conclusionDirectives}</div>
                </div>
              )}
              {hasSuggestions && (
                <div className="flex flex-col gap-2 py-2">
                  <div className="text-[12px] font-medium">
                    <span className={highlightTextStyles.info}>Suggestions</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {safeSuggestions.map((suggestion, index) => (
                      <div className={styles.suggestion} key={index}>
                        {suggestion}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {safeTags.length > 0 && (
                <div className={cn('flex', 'gap-2', 'flex-wrap', styles.tags)}>
                  {safeTags.map((tag, index) => (
                    <Badge key={index}>{tag}</Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

PreferenceMemoryCard.displayName = 'PreferenceMemoryCard';

export default PreferenceMemoryCard;
