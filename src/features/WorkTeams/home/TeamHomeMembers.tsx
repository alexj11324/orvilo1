'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { UsersIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import type { TeamHomeMember } from './teamHomeMembers';

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
    return <SkeletonList aria-label={t('teams.loading')} rows={4} />;
  }
  if (error) {
    return <AsyncError error={error} onRetry={onRetry} />;
  }
  if (members.length === 0) {
    return (
      <Flexbox align="center" flex={1} justify="center" padding={48}>
        <Empty description={t('teams.membersEmpty')} icon={UsersIcon} />
      </Flexbox>
    );
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
            <Flexbox flex={1} gap={0} style={{ minWidth: 0 }}>
              <span className={styles.name}>{member.name}</span>
              {member.email ? <span className={styles.email}>{member.email}</span> : null}
            </Flexbox>
          </div>
          {member.role === 'lead' ? <Tag color="gold">{t('teams.roleLead')}</Tag> : null}
          {member.joinedAt ? (
            <Text className={styles.joined}>{new Date(member.joinedAt).toLocaleDateString()}</Text>
          ) : null}
        </div>
      ))}
    </div>
  );
});

TeamHomeMembers.displayName = 'TeamHomeMembers';

export default TeamHomeMembers;
