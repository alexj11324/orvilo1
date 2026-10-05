import { BRANDING_NAME } from '@orvilo/business-const';
import { Clock3Icon, ClockArrowUp } from 'lucide-react';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { useClientDataSWR } from '@/libs/swr';
import { statsKeys } from '@/libs/swr/keys';
import { userService } from '@/services/user';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { formatIntergerNumber } from '@/utils/format';

import TimeLabel from '../components/TimeLabel';

const formatEnglishNumber = (number: number) => {
  if (number === 1) return '1st';
  if (number === 2) return '2nd';
  if (number === 3) return '3rd';
  return `${formatIntergerNumber(number)}th`;
};

const Welcome = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t, i18n } = useTranslation('auth');
  const [nickname, username] = useUserStore((s) => [
    userProfileSelectors.nickName(s),
    userProfileSelectors.username(s),
  ]);

  const { data, isLoading } = useClientDataSWR(statsKeys.welcome(), async () =>
    userService.getUserRegistrationDuration(),
  );

  return (
    <div className={'flex min-w-0'} style={{ flexDirection: 'column', padding: mobile ? 16 : 0 }}>
      <div
        className={'flex min-w-0'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        <Trans
          i18nKey="stats.welcome"
          ns={'auth'}
          components={{
            span:
              isLoading || !data ? (
                <Skeleton style={{ width: 40, height: 24, minWidth: 40 }} />
              ) : (
                <span style={{ fontWeight: 'bold' }} />
              ),
          }}
          values={{
            appName: BRANDING_NAME,
            days:
              i18n.language === 'en-US'
                ? formatEnglishNumber(Number(data?.duration || 1))
                : formatIntergerNumber(Number(data?.duration || 1)),
            username: nickname || username,
          }}
        />
      </div>
      <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <TimeLabel date={data?.createdAt} icon={Clock3Icon} title={t('stats.createdAt')} />
        <TimeLabel date={data?.updatedAt} icon={ClockArrowUp} title={t('stats.updatedAt')} />
      </div>
    </div>
  );
});

export default Welcome;
