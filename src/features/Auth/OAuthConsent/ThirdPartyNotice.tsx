'use client';

import { cssVar } from 'antd-style';
import { ExternalLinkIcon, TriangleAlert } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert } from '@/components/ui/alert';

interface ThirdPartyNoticeProps {
  developerName?: string;
  policyUri?: string;
}

const ThirdPartyNotice = memo<ThirdPartyNoticeProps>(({ developerName, policyUri }) => {
  const { t } = useTranslation('oauth');

  const developer = developerName || t('consent.thirdParty.unknownDeveloper');

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="text-muted-foreground">
        {t('consent.thirdParty.developedBy', { developerName: developer })}
      </div>
      <Alert variant="warning">
        <TriangleAlert />
        <AlertDescription>{t('consent.thirdParty.notice')}</AlertDescription>
      </Alert>
      {policyUri && (
        <a href={policyUri} rel={'noreferrer'} target={'_blank'}>
          <div className="flex items-center gap-1">
            <div style={{ color: cssVar.colorLink }}>{t('consent.thirdParty.privacyPolicy')}</div>
            <ExternalLinkIcon style={{ color: cssVar.colorLink, fontSize: 14 }} />
          </div>
        </a>
      )}
    </div>
  );
});

ThirdPartyNotice.displayName = 'ThirdPartyNotice';

export default ThirdPartyNotice;
