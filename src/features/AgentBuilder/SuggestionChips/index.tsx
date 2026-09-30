'use client';

import { cssVar } from 'antd-style';
import { RefreshCw } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Skeleton } from '@/components/ui/skeleton';
import SuggestQuestions, { type SuggestMode } from '@/features/SuggestQuestions';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';

import { useBuilderSuggestionFeedbackStore } from './feedbackStore';
import { useBuilderContext } from './useBuilderContext';
import { useBuilderSuggestions } from './useBuilderSuggestions';

interface ChipItemProps {
  disabled?: boolean;
  index: number;
  prompt: string;
  title: string;
  tracingId?: string;
}

const ChipItem = memo<ChipItemProps>(({ title, prompt, index, tracingId, disabled }) => {
  const mainInputEditor = useChatStore((s) => s.mainInputEditor);
  const markChipClicked = useBuilderSuggestionFeedbackStore((s) => s.markChipClicked);

  const handleClick = useCallback(() => {
    if (disabled) return;
    mainInputEditor?.instance?.setDocument('markdown', prompt);
    mainInputEditor?.focus();
    if (tracingId) markChipClicked({ index, prompt, tracingId });
  }, [disabled, prompt, index, tracingId, mainInputEditor, markChipClicked]);

  return (
    <div
      className="flex flex-col cursor-pointer rounded-md border border-border"
      style={{
        borderRadius: cssVar.borderRadiusLG,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : undefined,
      }}
      onClick={handleClick}
    >
      <div className="flex flex-col gap-1" style={{ paddingBlock: 12, paddingInline: 14 }}>
        <div className="truncate block text-[14px]" style={{ fontWeight: 500 }}>
          {title}
        </div>
        <div className="line-clamp-2 text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
          {prompt}
        </div>
      </div>
    </div>
  );
});

/**
 * Lightweight loading placeholder that keeps the exact chip-card chrome (same
 * Block, border, radius, padding) and only swaps the title/description text for
 * skeleton lines — minimising layout shift (CLS) when real chips arrive.
 */
const ChipSkeleton = memo(() => (
  <div
    className="flex flex-col rounded-md border border-border"
    style={{ borderRadius: cssVar.borderRadiusLG }}
  >
    <div className="flex flex-col gap-2" style={{ paddingBlock: 12, paddingInline: 14 }}>
      <Skeleton style={{ height: 14, width: 96 }} />
      <div className="flex flex-col gap-2">
        <Skeleton />
        <Skeleton style={{ width: '60%' }} />
      </div>
    </div>
  </div>
));

interface SuggestionChipsProps {
  /** Builtin builder agent id (drives the model + tracing `agentId`). */
  builderAgentId: string;
  count?: number;
  disabled?: boolean;
  /** `agentBuilder` | `groupBuilder` — selects the generation + fallback pool. */
  mode: SuggestMode;
}

/**
 * Context-aware opening suggestions for the Agent / Group Builder. Generates
 * build/configure-oriented chips from the current agent/group config and falls
 * back to the static curated pool while loading, on error, or when disabled.
 */
const SuggestionChips = memo<SuggestionChipsProps>(
  ({ mode, builderAgentId, count = 3, disabled }) => {
    const { t: tCommon } = useTranslation('common');
    const { contextSummary, generationMode, locale, targetId } = useBuilderContext(mode);

    const builderConfig = useAgentStore((s) =>
      agentByIdSelectors.getAgentConfigById(builderAgentId)(s),
    );
    const model = builderConfig?.model;
    const provider = builderConfig?.provider;

    const { suggestions, tracingId, isLoading, refresh } = useBuilderSuggestions({
      builderAgentId,
      contextSummary,
      enabled: !disabled && !!model && !!provider,
      locale,
      mode: generationMode,
      model: model ?? '',
      provider: provider ?? '',
      targetId,
    });

    // First load with nothing to show yet — card-shaped skeleton that keeps the
    // chip chrome and only loads the text, so there's near-zero layout shift.
    if (isLoading && suggestions.length === 0) {
      return (
        <div className="flex flex-col gap-2">
          {Array.from({ length: count }).map((_, index) => (
            <ChipSkeleton key={index} />
          ))}
        </div>
      );
    }

    // Dynamic, context-aware chips.
    if (suggestions.length > 0) {
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {suggestions.map((item, index) => (
              <ChipItem
                disabled={disabled}
                index={index}
                key={`${item.title}-${index}`}
                prompt={item.prompt}
                title={item.title}
                tracingId={tracingId}
              />
            ))}
          </div>
          <div
            className="flex items-center gap-1"
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.65 : undefined,
            }}
            onClick={() => {
              if (disabled) return;
              refresh();
            }}
          >
            <ActionIcon disabled={disabled} icon={RefreshCw} size={'small'} />
            <div className="text-[12px]" style={{ color: cssVar.colorTextSecondary }}>
              {tCommon('switch')}
            </div>
          </div>
        </div>
      );
    }

    // Fallback: error / empty / disabled / no usable model → static curated pool.
    return <SuggestQuestions count={count} disabled={disabled} mode={mode} />;
  },
);

export default SuggestionChips;
