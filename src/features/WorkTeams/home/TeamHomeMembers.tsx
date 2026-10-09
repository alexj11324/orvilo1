'use client';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { UsersIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/reui/badge';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Skeleton } from '@/components/ui/skeleton';

import type { TeamHomeMember } from './teamHomeMembersModel';

const styles = createStaticStyles(({ css }) => ({
  email: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  joined: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  list: css`
    display: flex;
    flex-direction: column;

    @container work-surface (max-width: 1000px) {
      padding-inline: 6px;
    }
  `,
  memberCell: css`
    display: flex;
    flex: 1;
    gap: 10px;
    align-items: center;

    min-width: 0;
  `,
  name: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

interface TeamHomeMembersProps {
  error: unknown;
  isLoading: boolean;
  members: TeamHomeMember[];
  onRetry: () => void;
}

/**
 * Linear's Members tab: the team's roster rows — avatar, name, email, the
 * lead badge and the membership date. Read-only; member administration stays
 * with the workspace/team owners, matching the existing rail's contract.
 */
const TeamHomeMembers = memo<TeamHomeMembersProps>(({ error, isLoading, members, onRetry }) => {
  const { t } = useTranslation('common');

  if (isLoading) {
    return (
      <div aria-busy aria-label={t('teams.loading')} className={styles.list}>
        {Array.from({ length: 4 }, (_, index) => (
          <div className={styles.row} key={index}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-col flex-1 gap-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <AsyncError error={error} onRetry={onRetry} />;
  }
  if (members.length === 0) {
    return <SimpleEmpty description={t('teams.membersEmpty')} icon={UsersIcon} />;
  }

  return (
    <div className={styles.list}>
      {members.map((member) => (
        <div className={styles.row} key={member.userId}>
          <div className={styles.memberCell}>
            <Avatar
              avatar={member.avatar}
              name={member.name}
              size={32}
              title={member.email ?? member.name}
            />
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <span className={styles.name}>{member.name}</span>
              {member.email ? <span className={styles.email}>{member.email}</span> : null}
            </div>
          </div>
          {member.role === 'lead' ? <Badge variant="secondary">{t('teams.roleLead')}</Badge> : null}
          {member.joinedAt ? (
            <span className={cn('text-sm', styles.joined)}>
              {new Date(member.joinedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
});

TeamHomeMembers.displayName = 'TeamHomeMembers';

export default TeamHomeMembers;
