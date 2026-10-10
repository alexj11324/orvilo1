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

import type { AddExperienceMemoryParams } from '../../types';

const styles = {
  container: 'overflow-hidden w-full border border-sidebar-border rounded-[16px] bg-card',
  content: '[padding-block:12px] [padding-inline:16px]',
  detail: 'text-[13px] leading-[1.6] text-muted-foreground',
  header:
    '[padding-block:10px] [padding-inline:12px] [border-block-end:1px_solid_var(--sidebar-border)]',
  keyLearning: 'text-sm leading-[1.6] text-foreground',
  section: 'p-1 [border-block-start:1px_solid_var(--sidebar-border)]',
  stepContent: 'text-[13px] leading-[1.6] text-muted-foreground whitespace-pre-wrap',
  summary: 'text-sm leading-[inherit] font-medium text-muted-foreground',
  tags: '[padding-block-start:8px] [border-block-start:1px_dashed_var(--sidebar-border)]',
  title: 'line-clamp-1 font-medium text-foreground',
};

export interface ExperienceMemoryCardProps {
  data?: AddExperienceMemoryParams;
  loading?: boolean;
}

export const ExperienceMemoryCard = memo<ExperienceMemoryCardProps>(({ data, loading }) => {
  const { summary, details, tags, title, withExperience } = data || {};
  const { situation, reasoning, action, possibleOutcome, keyLearning } = withExperience || {};

  // `tags` comes from raw model tool-call args without zod coercion, so a model may
  // emit a scalar where `string[]` is expected. Normalize to an array to keep this
  // card from crashing on dirty input (`.map` on a non-array).
  const safeTags = Array.isArray(tags) ? tags : [];

  const hasStarContent = situation || reasoning || action || possibleOutcome;

  if (!summary && !details && !safeTags.length && !title && !hasStarContent && !keyLearning)
    return null;

  const starItems = [
    { avatar: 'S', content: situation, title: 'Situation' },
    { avatar: 'T', content: reasoning, title: 'Task' },
    { avatar: 'A', content: action, title: 'Action' },
    { avatar: 'R', content: possibleOutcome, title: 'Result' },
  ].filter((item) => item.content);

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      {/* Header */}
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <div className="flex flex-col flex-1">
          <div className={styles.title}>{title || 'Experience Memory'}</div>
        </div>
        {loading && <NeuralNetworkLoading size={20} />}
      </div>

      {/* When has STAR content: collapse summary */}
      {hasStarContent ? (
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

          {/* STAR Steps */}
          <Accordion className={styles.section} defaultValue={['star']}>
            <AccordionItem value="star">
              <AccordionTrigger>
                <div className="text-[12px] text-muted-foreground font-medium">STAR</div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col px-2" style={{ paddingBlock: '8px 12px' }}>
                  <Stepper orientation="vertical" value={0}>
                    <StepperNav>
                      {starItems.map((item, index) => (
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
                          {index < starItems.length - 1 && <StepperSeparator className="h-4" />}
                        </StepperItem>
                      ))}
                    </StepperNav>
                  </Stepper>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Key Learning */}
          {keyLearning && (
            <div
              className={cn('flex', 'flex-col', 'gap-2', styles.section)}
              style={{ paddingBlock: 16, paddingInline: 12 }}
            >
              <div className="text-[12px] font-medium">
                <span className={highlightTextStyles.gold}>Key Learning</span>
              </div>
              <div className={styles.keyLearning}>{keyLearning}</div>
            </div>
          )}
        </>
      ) : (
        /* When no STAR content: show summary and details */
        <div className={cn('flex', 'flex-col', 'gap-2', styles.content)}>
          {!summary && loading ? (
            <BubblesLoading />
          ) : (
            <>
              {summary && <div className={styles.summary}>{summary}</div>}
              {details && <StreamingMarkdown>{details}</StreamingMarkdown>}
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

ExperienceMemoryCard.displayName = 'ExperienceMemoryCard';

export default ExperienceMemoryCard;
