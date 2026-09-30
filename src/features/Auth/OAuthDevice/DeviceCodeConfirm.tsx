'use client';

import React, { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AuthCard from '@/features/AuthCard';

import ThirdPartyNotice from '../OAuthConsent/ThirdPartyNotice';

interface DeviceCodeConfirmProps {
  clientName: string;
  developerName?: string;
  isFirstParty?: boolean;
  policyUri?: string;
  userCode: string;
  xsrf?: string;
}

const DeviceCodeConfirm = memo<DeviceCodeConfirmProps>(
  ({ xsrf, userCode, clientName, developerName, isFirstParty, policyUri }) => {
    const { t } = useTranslation('oauth');
    const [isLoading, setIsLoading] = useState(false);

    return (
      <AuthCard
        subtitle={t('device.confirm.description', { clientName })}
        title={t('device.confirm.title')}
        footer={
          <form action="/oidc/device" method="post" style={{ width: '100%' }}>
            {xsrf && <input name="xsrf" type="hidden" value={xsrf} />}
            <input name="user_code" type="hidden" value={userCode} />
            <input name="confirm" type="hidden" value="yes" />
            <div className="flex flex-col gap-3">
              <Button
                className="w-full"
                loading={isLoading}
                size="lg"
                type="submit"
                variant="default"
                onClick={() => setIsLoading(true)}
              >
                {t('device.confirm.authorize')}
              </Button>
              <Button className="w-full" name="abort" size="lg" type="submit" value="yes">
                {t('device.confirm.deny')}
              </Button>
            </div>
          </form>
        }
      >
        {isFirstParty === false && (
          <div className="flex flex-col" style={{ marginBottom: 16 }}>
            <ThirdPartyNotice developerName={developerName} policyUri={policyUri} />
          </div>
        )}
        <div className="flex flex-col p-4">
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 24,
              fontWeight: 'bold',
              letterSpacing: '0.15em',
              textAlign: 'center',
            }}
          >
            {userCode}
          </div>
        </div>
        <div className="text-muted-foreground" style={{ marginTop: 8 }}>
          {t('device.confirm.codeHint')}
        </div>
      </AuthCard>
    );
  },
);

DeviceCodeConfirm.displayName = 'DeviceCodeConfirm';

export default DeviceCodeConfirm;
