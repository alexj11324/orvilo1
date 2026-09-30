'use client';

import { Avatar, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    padding-block: 12px;
    padding-inline: 16px;
  `,
  detail: css`
    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
  `,
  directive: css`
    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};
  `,
  header: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  section: css`
    padding: 4px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  stepContent: css`
    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
    white-space: pre-wrap;
  `,
  suggestion: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 8px;

    font-size: 13px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  summary: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  tags: css`
    padding-block-start: 8px;
    border-block-start: 1px dashed ${cssVar.colorBorderSecondary};
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

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
        {type && <Tag>{type}</Tag>}
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
                  <Text fontSize={12} type={'secondary'} weight={500}>
                    Summary
                  </Text>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2 px-2" style={{ paddingBlock: '8px 12px' }}>
                    {summary && <div className={styles.summary}>{summary}</div>}
                    {details && <div className={styles.detail}>{details}</div>}
                    {safeTags.length > 0 && (
                      <div className={cn('flex', 'gap-2', 'flex-wrap', styles.tags)}>
                        {safeTags.map((tag, index) => (
                          <Tag key={index}>{tag}</Tag>
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
                  <Text fontSize={12} type={'secondary'} weight={500}>
                    Origin Context
                  </Text>
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
                                    border: `1px solid ${cssVar.colorBorderSecondary}`,
                                    fontSize: 11,
                                  }}
                                />
                              </StepperIndicator>
                              <div className="flex flex-col gap-1">
                                <StepperTitle>
                                  <Text as={'span'} fontSize={12} type={'secondary'} weight={500}>
                                    {item.title}
                                  </Text>
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
                  <Text fontSize={12} type={'secondary'} weight={500}>
                    App Context
                  </Text>
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
                                    border: `1px solid ${cssVar.colorBorderSecondary}`,
                                    fontSize: 11,
                                  }}
                                />
                              </StepperIndicator>
                              <div className="flex flex-col gap-1">
                                <StepperTitle>
                                  <Text as={'span'} fontSize={12} type={'secondary'} weight={500}>
                                    {item.title}
                                  </Text>
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
              <Text fontSize={12} weight={500}>
                <span className={highlightTextStyles.primary}>Directive</span>
              </Text>
              <div className={styles.directive}>{conclusionDirectives}</div>
            </div>
          )}

          {/* Suggestions */}
          {hasSuggestions && (
            <div
              className={cn('flex', 'flex-col', 'gap-2', styles.section)}
              style={{ paddingBlock: 16, paddingInline: 12 }}
            >
              <Text fontSize={12} weight={500}>
                <span className={highlightTextStyles.info}>Suggestions</span>
              </Text>
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
                  <Text fontSize={12} weight={500}>
                    <span className={highlightTextStyles.primary}>Directive</span>
                  </Text>
                  <div className={styles.directive}>{conclusionDirectives}</div>
                </div>
              )}
              {hasSuggestions && (
                <div className="flex flex-col gap-2 py-2">
                  <Text fontSize={12} weight={500}>
                    <span className={highlightTextStyles.info}>Suggestions</span>
                  </Text>
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
                    <Tag key={index}>{tag}</Tag>
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
