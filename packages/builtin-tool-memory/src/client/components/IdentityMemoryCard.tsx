'use client';

import { Progress, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import StreamingMarkdown from '@/components/StreamingMarkdown';

import type { IdentityMemoryViewModel } from './identityMemoryViewModel';
import { memoryCardStyles as styles, MemorySection, SummaryAccordion } from './MemoryCardParts';

const localStyles = createStaticStyles(({ css, cssVar }) => ({
  evidence: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-inline-start: 2px solid ${cssVar.colorBorder};

    font-size: 13px;
    font-style: italic;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
  `,
}));

export interface IdentityMemoryCardProps {
  data: IdentityMemoryViewModel;
  /** Header text when the memory has no title yet. */
  fallbackTitle?: string;
  loading?: boolean;
}

/**
 * Renders one identity fact. Shared by the add and update flows, which differ only
 * in the surrounding framing, not in how an identity itself reads.
 */
export const IdentityMemoryCard = memo<IdentityMemoryCardProps>(
  ({ data, fallbackTitle = 'Identity Memory', loading }) => {
    const {
      confidence,
      description,
      details,
      episodicDate,
      hasIdentityContent,
      identityType,
      isEmpty,
      labels,
      relationship,
      role,
      sourceEvidence,
      summary,
      tags,
      title,
    } = data;

    if (isEmpty) return null;

    return (
      <div className={cn('flex', 'flex-col', styles.container)}>
        <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
          <div className="flex flex-col flex-1">
            <div className={styles.title}>{title || fallbackTitle}</div>
          </div>
          {identityType && <Tag>{identityType}</Tag>}
          {relationship && <Tag color={'info'}>{relationship}</Tag>}
          {loading && <NeuralNetworkLoading size={20} />}
        </div>

        {hasIdentityContent ? (
          <>
            <SummaryAccordion details={details} summary={summary} tags={tags} />

            {description && (
              <MemorySection title={'Description'}>
                <div className={styles.sectionBody}>
                  <StreamingMarkdown>{description}</StreamingMarkdown>
                </div>
              </MemorySection>
            )}

            {(role || episodicDate || confidence !== undefined) && (
              <div
                className={cn('flex', 'items-center', 'gap-4', 'flex-wrap', styles.section)}
                style={{ paddingBlock: 12, paddingInline: 12 }}
              >
                {role && (
                  <div className={cn('flex', 'items-center', 'gap-[6px]', styles.chip)}>
                    <span>🎓</span>
                    <span>{role}</span>
                  </div>
                )}
                {episodicDate && (
                  <div className="flex items-center gap-[6px]">
                    <span>📅</span>
                    <Text fontSize={12} type={'secondary'}>
                      {episodicDate}
                    </Text>
                  </div>
                )}
                {confidence !== undefined && (
                  <div className="flex items-center gap-2">
                    <Text fontSize={12} type={'secondary'} weight={500}>
                      Confidence
                    </Text>
                    <Progress percent={confidence} showInfo={false} size={[2, 12]} steps={5} />
                    <Text fontSize={12} type={'secondary'}>
                      {confidence}%
                    </Text>
                  </div>
                )}
              </div>
            )}

            {sourceEvidence && (
              <MemorySection title={'Evidence'} tone={'gold'}>
                <div className={localStyles.evidence}>{sourceEvidence}</div>
              </MemorySection>
            )}

            {labels.length > 0 && (
              <div
                className={cn('flex', 'gap-2', 'flex-wrap', styles.section)}
                style={{ paddingBlock: 12, paddingInline: 12 }}
              >
                {labels.map((label, index) => (
                  <Tag key={index}>{label}</Tag>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={cn('flex', 'flex-col', 'gap-2', styles.content)}>
            {!summary && loading ? (
              <BubblesLoading />
            ) : (
              <>
                {summary && <div className={styles.summary}>{summary}</div>}
                {details && <StreamingMarkdown>{details}</StreamingMarkdown>}
                {tags.length > 0 && (
                  <div className={cn('flex', 'gap-2', 'flex-wrap', styles.tags)}>
                    {tags.map((tag, index) => (
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
  },
);

IdentityMemoryCard.displayName = 'IdentityMemoryCard';

export default IdentityMemoryCard;
