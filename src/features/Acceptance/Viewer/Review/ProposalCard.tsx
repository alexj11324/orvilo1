'use client';

import { cn } from 'cn';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import type { CheckProposal } from './proposal';

const styles = {
  /* Dashed and untinted: provisional suggestions stay distinct from verdicts. */
  card: 'rounded-(--ant-border-radius-lg) border border-dashed border-border px-2.5 py-2',
  head: 'cursor-pointer select-none',
  /* The collapsed line carries the claim without needing to open the card. */
  preview: 'min-w-0 flex-1 truncate text-[12px]',
  /* Provenance labels stay quieter than secondary content. */
  muted: 'text-[11px] text-(--ant-color-text-quaternary)',
  regionIndex:
    'size-4 flex-none rounded-full bg-destructive text-center text-[10px] leading-4 font-semibold text-white',
};

interface ProposalCardProps {
  onAdjudicate: (adjudication: 'misidentified' | 'not-an-issue') => Promise<void> | void;
  /** Opens the prefilled reject modal — the confirm path. */
  onConfirm: () => void;
  /** Report expansion up so the evidence images below can show/hide the overlay. */
  onToggle: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  proposal: CheckProposal;
}

/**
 * An automated reviewer's proposal on one check.
 *
 * Deliberately carries NO image of its own: the evidence it is talking about
 * already renders directly below, and a second copy made the same screenshot
 * appear twice in one row. Opening this card instead draws the model's regions
 * onto that existing image, with badge numbers matching the list here.
 *
 * The three responses are not cosmetic. A flat accept/dismiss pair would merge
 * two opposite training signals — "there is no problem here" and "there IS a
 * problem but you circled the wrong thing" — and the second is a POSITIVE
 * signal on the judgement. Collapsing them teaches the model that speaking up
 * is risky, which is the wrong lesson for a reviewer whose measured failure
 * mode is being too lenient.
 */
const ProposalCard = memo<ProposalCardProps>(
  ({ onAdjudicate, onConfirm, onToggle, open, pending, proposal }) => {
    const { t } = useTranslation('verify');
    const [busy, setBusy] = useState<'misidentified' | 'not-an-issue' | null>(null);

    const respond = async (adjudication: 'misidentified' | 'not-an-issue') => {
      setBusy(adjudication);
      try {
        await onAdjudicate(adjudication);
      } finally {
        setBusy(null);
      }
    };

    const regions = proposal.annotations ?? [];

    return (
      <div className={`flex flex-col ${styles.card}`} style={{ gap: open ? 8 : 0 }}>
        <div
          {...clickableProps()}
          className={cn(`flex items-center gap-1.5 ${styles.head}`, CLICKABLE_FOCUS_RING)}
          onClick={() => onToggle(!open)}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Sparkles size={12} />
          <div className="text-[12px] text-muted-foreground" style={{ flex: 'none' }}>
            {t('acceptance.proposal.title')}
          </div>
          {/* Provenance sits beside the claim it qualifies, but only once the
              card is open. Collapsed, the row's job is the finding itself —
              a model id there just pushes the summary out of view. */}
          {open && (
            <span className={styles.muted}>
              {proposal.provider}/{proposal.model}
            </span>
          )}
          {!open && proposal.comment && <span className={styles.preview}>{proposal.comment}</span>}
          {!open && regions.length > 0 && (
            <span className={styles.muted}>
              {t('acceptance.proposal.regionCount', { count: regions.length })}
            </span>
          )}
        </div>

        {open && (
          <>
            {proposal.comment && <div className="text-[12px]">{proposal.comment}</div>}

            {/* Numbers match the badges now drawn on the evidence image below. */}
            {regions.map((region, index) => (
              <div className="flex items-start gap-1.5" key={index}>
                <span className={styles.regionIndex} style={{ marginBlockStart: 2 }}>
                  {index + 1}
                </span>
                <div className="text-[12px] text-muted-foreground">
                  {region.comment || t('acceptance.proposal.regionUnnamed')}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                disabled={pending || Boolean(busy)}
                size="sm"
                variant="outline"
                onClick={onConfirm}
              >
                {t('acceptance.proposal.confirm')}
              </Button>
              <Button
                disabled={pending || Boolean(busy)}
                loading={busy === 'not-an-issue'}
                size="sm"
                onClick={() => respond('not-an-issue')}
              >
                {t('acceptance.proposal.notAnIssue')}
              </Button>
              <Button
                disabled={pending || Boolean(busy)}
                loading={busy === 'misidentified'}
                size="sm"
                variant="ghost"
                onClick={() => respond('misidentified')}
              >
                {t('acceptance.proposal.misidentified')}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  },
);

ProposalCard.displayName = 'AcceptanceProposalCard';

export default ProposalCard;
