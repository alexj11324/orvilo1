'use client';

import { Alert, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { ExternalLinkIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface ThirdPartyNoticeProps {
  developerName?: string;
  policyUri?: string;
}

const ThirdPartyNotice = memo<ThirdPartyNoticeProps>(({ developerName, policyUri }) => {
  const { t } = useTranslation('oauth');

  const developer = developerName || t('consent.thirdParty.unknownDeveloper');

  return (
    <div className="flex flex-col gap-2 w-full">
      <Text type={'secondary'}>
        {t('consent.thirdParty.developedBy', { developerName: developer })}
      </Text>
      <Alert showIcon description={t('consent.thirdParty.notice')} type={'warning'} />
      {policyUri && (
        <a href={policyUri} rel={'noreferrer'} target={'_blank'}>
          <div className="flex items-center gap-1">
            <Text style={{ color: cssVar.colorLink }}>{t('consent.thirdParty.privacyPolicy')}</Text>
            <ExternalLinkIcon style={{ color: cssVar.colorLink, fontSize: 14 }} />
          </div>
        </a>
      )}
    </div>
  );
});

ThirdPartyNotice.displayName = 'ThirdPartyNotice';

export default ThirdPartyNotice;
