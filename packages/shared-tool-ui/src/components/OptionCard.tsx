'use client';

import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => ({
  // Card sits inline with the chat — no surrounding panel chrome. Hover
  // tints the row so the stack reads as clickable; selection swaps to a
  // neutral filled row so the pick is visually weighty. We use `colorFill*`
  // rather than `colorPrimaryBg` because Orvilo's default primary is a
  // near-black neutral, which makes `colorPrimaryBg` render as a muddy black
  // block; the selection signal instead rides the filled row + the checkmark.
  option: css`
    cursor: pointer;

    padding-block: 10px;
    padding-inline: 12px;
    border-radius: 8px;

    transition: background 0.12s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  optionCheck: css`
    flex-shrink: 0;
    color: ${cssVar.colorPrimary};
  `,
  optionDescription: css`
    font-size: 12px;
    line-height: 1.45;
    color: ${cssVar.colorTextSecondary};
  `,
  // Neutral 1/2/3/4 chip — stays the same colour whether selected or not so
  // the selection signal lives on the filled background + checkmark.
  optionIndex: css`
    flex-shrink: 0;

    box-sizing: border-box;
    width: 22px;
    height: 22px;
    border-radius: 6px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    font-weight: 600;
    line-height: 22px;
    color: ${cssVar.colorTextSecondary};
    text-align: center;

    background: ${cssVar.colorFillTertiary};
  `,
  // Keyboard cursor — a ring instead of a fill so it stays legible when
  // stacked on the hover tint or the selected fill.
  optionHighlighted: css`
    box-shadow: inset 0 0 0 1px ${cssVar.colorBorder};
  `,
  optionLabel: css`
    font-weight: 500;
  `,
  // One step above the hover tint is enough — the checkmark carries the
  // selection signal, so a heavy fill just reads as a muddy block. The hover
  // override repeats the same fill: it must outrank `.option:hover` (which
  // would otherwise drop the row to the lighter unselected tint), and no
  // darkening keeps the selected row flat — it's already "on".
  optionSelected: css`
    background: ${cssVar.colorFillTertiary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  recommendedBadge: css`
    flex-shrink: 0;

    padding-block: 1px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 11px;
    line-height: 18px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
}));

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
        cx(
          styles.option,
          selected && styles.optionSelected,
          highlighted && styles.optionHighlighted,
        ),
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
