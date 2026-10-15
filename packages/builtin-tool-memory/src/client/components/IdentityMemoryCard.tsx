'use client';
import { cn } from 'cn';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge } from '@/components/reui/badge';
import StreamingMarkdown from '@/components/StreamingMarkdown';

import type { IdentityMemoryViewModel } from './identityMemoryViewModel';
import { memoryCardStyles as styles, MemorySection, SummaryAccordion } from './MemoryCardParts';

const localStyles = {
  evidence:
    'py-2 px-3 [border-inline-start:2px_solid_var(--border)] text-sm italic text-muted-foreground',
};

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
          {identityType && <Badge>{identityType}</Badge>}
          {relationship && <Badge variant="info">{relationship}</Badge>}
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
                  <div className={cn('flex', 'items-center', 'gap-1.5', styles.chip)}>
                    <span>🎓</span>
                    <span>{role}</span>
                  </div>
                )}
                {episodicDate && (
                  <div className="flex items-center gap-1.5">
                    <span>📅</span>
                    <div className="text-xs text-muted-foreground">{episodicDate}</div>
                  </div>
                )}
                {confidence !== undefined && (
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground font-medium">Confidence</div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }, (_, index) => (
                        <div
                          className="h-0.5 w-3 rounded-full"
                          key={index}
                          style={{
                            background:
                              index < Math.round((confidence * 5) / 100)
                                ? 'var(--primary)'
                                : 'var(--muted)',
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">{confidence}%</div>
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
                  <Badge key={index}>{label}</Badge>
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
  },
);

IdentityMemoryCard.displayName = 'IdentityMemoryCard';

export default IdentityMemoryCard;
