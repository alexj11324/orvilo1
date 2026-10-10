'use client';

import { GitPullRequest } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';

import { useAcceptanceScope } from '../AcceptanceScope';
import { acceptanceCodingScope } from '../History/codingScope';
import { useAcceptanceBundle } from '../useAcceptanceBundle';
import AcceptanceStatusPill from './AcceptanceStatusPill';

const styles = {
  titleRow: '[@media(width<=767px)]:pe-12',
  metaRow: 'text-[13px] text-muted-foreground',
  scopeLink: 'cursor-pointer text-muted-foreground hover:text-foreground hover:underline',
};

interface AcceptanceIdentityProps {
  statusSlot?: ReactNode;
  topicSlot?: ReactNode;
}

/**
 * The delivery's name, then one bar of everything that qualifies it.
 *
 * The name leads, the way a pull request leads with its own: it is what a
 * reader scans for, and putting the state above it made the state the headline
 * of a record whose headline is its subject. Under the name, a single bar
 * carries state, who
 * delivered it, and where it came from — the agent, the originating
 * conversation, the pull request — because those were three separate rows
 * saying one thing: the context of this record.
 *
 * The pass/uncertain tally and the last-run time are gone from here. They
 * change every round and read as the delivery's verdict while sitting above
 * the checklist that actually shows them, so the header claimed an outcome the
 * reader had not reached yet.
 */

const AcceptanceIdentity = ({ statusSlot, topicSlot }: AcceptanceIdentityProps) => {
  const { t } = useTranslation('verify');
  const { acceptanceId, embedded } = useAcceptanceScope();
  const { data } = useAcceptanceBundle(acceptanceId);
  if (!data) return null;

  const { acceptance, author, origin, rounds, subject } = data;
  const authorName = author?.fullName || author?.username;
  const scope = acceptanceCodingScope(rounds);
  const pullRequest = scope?.pullRequest;
  const originAgent = embedded ? null : origin?.agent;
  const agentName = originAgent?.title ?? t('acceptance.origin.agentFallback');

  return (
    <div className="flex flex-col gap-2.5">
      {/* No subject-type tag beside the name. Which KIND of thing was
          delivered is a fact about the plumbing, not about the delivery a
          reader came to judge — and it sat where the title's own meaning
          should carry. */}
      <div className={`flex items-center gap-2.5 flex-wrap ${styles.titleRow}`}>
        <h1 className="truncate min-w-0" style={{ fontSize: 18, margin: 0, minWidth: 0 }}>
          {subject.title ?? subject.id}
        </h1>
      </div>

      <div className={`flex items-center gap-3 flex-wrap ${styles.metaRow}`}>
        {statusSlot ?? <AcceptanceStatusPill status={acceptance.status} />}
        {/* Who delivered this, right after its state — the same place a pull
            request names its author. A shared record with no name on it reads
            as nobody's, and the status alone never says whose work it is. */}
        {authorName && (
          <div className="flex items-center gap-1.5">
            <Avatar avatar={author?.avatar || authorName.slice(0, 1)} size={18} />
            <div style={{ color: 'var(--foreground)', fontSize: 'inherit' }}>{authorName}</div>
          </div>
        )}
        {originAgent && (
          <div className="flex items-center gap-1.5" style={{ cursor: 'default' }}>
            {/* Beside the author's face, an agent with no picture used to draw
                the library's "UN" placeholder — two avatars in one bar, one of
                them claiming a name nobody has. Fall back to its own initial,
                the way the author's does. */}
            <Avatar
              avatar={originAgent.avatar || agentName.slice(0, 1)}
              background={originAgent.backgroundColor ?? undefined}
              size={18}
            />
            {agentName}
          </div>
        )}
        {topicSlot}
        {pullRequest?.number ? (
          pullRequest.url ? (
            <a
              className={styles.scopeLink}
              href={pullRequest.url}
              rel={'noreferrer'}
              target={'_blank'}
              title={pullRequest.title ?? pullRequest.url}
            >
              <div className="flex items-center gap-1">
                <GitPullRequest size={13} /> #{pullRequest.number}
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-1">
              <GitPullRequest size={13} /> #{pullRequest.number}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};

export default AcceptanceIdentity;
