'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';

// Selection keeps the same fill on hover; the inset border marks the keyboard cursor.
const styles = {
  option:
    'cursor-pointer rounded-[8px] px-3 py-2.5 transition-[background] duration-[120ms] ease-[ease] hover:bg-[var(--ant-color-fill-quaternary)]',
  optionCheck: 'shrink-0 text-primary',
  optionDescription: 'text-[12px] leading-[1.45] text-muted-foreground',
  optionIndex:
    'box-border size-[22px] shrink-0 rounded-[6px] bg-accent font-mono text-[12px] font-semibold leading-[22px] text-muted-foreground text-center',
  optionHighlighted: '[box-shadow:inset_0_0_0_1px_var(--border)]',
  optionLabel: 'font-medium',
  optionSelected: 'bg-accent hover:bg-accent',
  recommendedBadge:
    'shrink-0 rounded-[999px] bg-selected px-2 py-px text-[11px] leading-[18px] text-muted-foreground',
};

export interface OptionCardProps {
  description?: string;
  disabled?: boolean;
  /** Keyboard cursor (↑/↓) — independent from `selected`, which is the pick. */
  highlighted?: boolean;
  index: number;
  label: string;
  onToggle: () => void;
  /** Badge text rendered after the label for a model-recommended option. */
  recommendedText?: string;
  selected: boolean;
}

/**
 * One numbered option in a question. Filled when picked, neutral otherwise;
 * a right-side checkmark seals the selection so the state reads cleanly even
 * with the number chip kept neutral.
 *
 * Presentational and self-contained — shared across the ask-user surfaces
 * (Claude Code `AskUserQuestion`, the builtin `user-interaction` /
 * `orvilo-agent` clarification form) so the tiled options read identically
 * everywhere.
 */
export const OptionCard = memo<OptionCardProps>(
  ({ index, label, description, highlighted, recommendedText, selected, disabled, onToggle }) => (
    <div
      aria-selected={selected}
      role="option"
      className={cn(
        'flex',
        'items-center',
        'gap-3',
        styles.option,
        selected && styles.optionSelected,
        highlighted && styles.optionHighlighted,
      )}
      onClick={() => {
        if (!disabled) onToggle();
      }}
    >
      <span className={styles.optionIndex}>{index}</span>
      <div className="flex flex-col flex-1 gap-[2px]">
        <div className="flex items-center gap-2">
          <div className={styles.optionLabel}>{label}</div>
          {recommendedText && <span className={styles.recommendedBadge}>{recommendedText}</span>}
        </div>
        {description && <span className={styles.optionDescription}>{description}</span>}
      </div>
      {selected && <Check className={styles.optionCheck} size={16} />}
    </div>
  ),
);

OptionCard.displayName = 'OptionCard';

export default OptionCard;
