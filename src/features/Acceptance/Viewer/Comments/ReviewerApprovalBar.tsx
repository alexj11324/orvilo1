'use client';

import { BadgeCheck } from 'lucide-react';
import { nanoid } from 'nanoid';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useAcceptanceScope } from '../AcceptanceScope';
import { useAcceptanceBundle } from '../useAcceptanceBundle';
import { canReviewAcceptance } from '../visibility';
import { useAcceptanceComments } from './hooks';

const styles = {
  card: 'py-3.5 px-4 border border-sidebar-border rounded-[12px] bg-card',
  description: 'text-[12px] text-(--ant-color-text-tertiary)',
};

/**
 * The reviewer's counterpart of the decision bar. A teammate who can review
 * but cannot close the acceptance says "fine by me" here; it lands as an
 * approval row the owner reads, and the acceptance status stays untouched.
 *
 * A visitor who only holds the public link is not offered it: they can answer
 * the evidence in the discussion, but accepting a delivery is the team's call.
 *
 * An approval is never final while the round is open: review is a moving
 * opinion, so it can be withdrawn and given again at any point. Only the state
 * standing when the owner decides matters, and the newest row is that state.
 */
const ReviewerApprovalBar = memo(() => {
  const { t } = useTranslation('verify');
  const { acceptanceId } = useAcceptanceScope();
  const { data } = useAcceptanceBundle(acceptanceId);
  const { canApprove, create, items, remove } = useAcceptanceComments(acceptanceId);
  const viewerId = useUserStore(userProfileSelectors.userId);
  const [summary, setSummary] = useState('');
  const [pending, setPending] = useState(false);

  if (!data || !canApprove || canReviewAcceptance(data)) return null;
  if (data.acceptance.status === 'accepted' || data.acceptance.status === 'closed') return null;

  // Nothing has been delivered yet, so there is nothing to approve. Allowing it
  // would pin the approval to no round at all, and an unpinned approval reads
  // as approving every round that ever arrives — the reviewer would never be
  // asked to look at the evidence.
  const currentRound = data.rounds.at(-1)?.run;
  if (!currentRound) return null;

  // Read ownership from the author. `canDelete` also turns on for someone who
  // may moderate this acceptance, so borrowing it here would show a reviewer
  // their teammate's approval as their own and let them withdraw it.
  const mine = [...items]
    .reverse()
    .find(
      (item) =>
        item.kind === 'approval' &&
        !item.deletedAt &&
        Boolean(viewerId) &&
        item.authorUserId === viewerId,
    );
  const approvedCurrentRound = mine?.contextRoundIndex === currentRound.roundIndex;

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    try {
      await action();
      setSummary('');
    } catch (cause) {
      console.error('[acceptance:comments]', cause);
      toast.error(t('acceptance.comments.createFailed'));
    } finally {
      setPending(false);
    }
  };

  const approve = () =>
    run(() =>
      create({
        clientId: nanoid(),
        content: summary.trim(),
        contextRunId: currentRound.id,
        kind: 'approval',
      }),
    );

  return (
    <div className={`flex flex-col gap-2.5 ${styles.card}`}>
      <div className="flex items-center gap-2">
        <BadgeCheck color={approvedCurrentRound ? 'var(--success)' : undefined} size={18} />
        <div className="font-semibold">
          {mine
            ? mine.contextRoundIndex === null
              ? t('acceptance.comments.youApprovedNoRound')
              : t('acceptance.comments.youApproved', { round: mine.contextRoundIndex })
            : t('acceptance.comments.approve')}
        </div>
      </div>
      <span className={styles.description}>
        {approvedCurrentRound
          ? t('acceptance.comments.withdrawDescription')
          : t('acceptance.comments.approveDescription')}
      </span>
      {approvedCurrentRound ? (
        <Button
          loading={pending}
          style={{ alignSelf: 'flex-end' }}
          onClick={() => void run(() => remove(mine!.id))}
        >
          {t('acceptance.comments.withdraw')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder={t('acceptance.comments.approveSummaryPlaceholder')}
            rows={1}
            style={{ maxHeight: '4lh' }}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
          <Button
            loading={pending}
            style={{ alignSelf: 'flex-end' }}
            variant="outline"
            onClick={() => void approve()}
          >
            {mine ? t('acceptance.comments.approveAgain') : t('acceptance.comments.approve')}
          </Button>
        </div>
      )}
    </div>
  );
});

ReviewerApprovalBar.displayName = 'AcceptanceReviewerApprovalBar';

export default ReviewerApprovalBar;
