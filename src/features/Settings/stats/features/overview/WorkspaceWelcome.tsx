import dayjs from 'dayjs';
import { Clock3Icon, UsersIcon } from 'lucide-react';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceMembers } from '@/business/client/hooks/useWorkspaceMembers';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIntergerNumber } from '@/utils/format';

import TimeLabel from '../components/TimeLabel';

const formatEnglishNumber = (number: number) => {
  if (number === 1) return '1st';
  if (number === 2) return '2nd';
  if (number === 3) return '3rd';
  return `${formatIntergerNumber(number)}th`;
};

const WorkspaceWelcome = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t, i18n } = useTranslation('auth');
  const workspace = useActiveWorkspace();
  const members = useWorkspaceMembers();

  if (!workspace) {
    return <Skeleton style={{ width: 200, height: 24, minWidth: 200 }} />;
  }

  const days = Math.max(1, dayjs().diff(dayjs(workspace.createdAt), 'day'));
  const memberCount = members.length;

  return (
    <div className={'flex min-w-0'} style={{ flexDirection: 'column', padding: mobile ? 16 : 0 }}>
      <div
        className={'flex min-w-0'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        <Trans
          i18nKey="stats.workspace.welcome"
          ns={'auth'}
          components={{
            span: <span style={{ fontWeight: 'bold' }} />,
          }}
          values={{
            days:
              i18n.language === 'en-US' ? formatEnglishNumber(days) : formatIntergerNumber(days),
            name: workspace.name,
          }}
        />
      </div>
      <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <TimeLabel date={String(memberCount)} icon={UsersIcon} />
        <TimeLabel
          date={dayjs(workspace.createdAt).format('YYYY-MM-DD')}
          icon={Clock3Icon}
          title={t('stats.createdAt')}
        />
      </div>
    </div>
  );
});

export default WorkspaceWelcome;
