'use client';

import { Button, Text } from '@lobehub/ui/base-ui';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import AuthCard from '@/features/AuthCard';

interface DeviceCodeInputProps {
  errorKey?: string;
  userCode?: string;
  xsrf?: string;
}

const DeviceCodeInput = memo<DeviceCodeInputProps>(({ xsrf, errorKey, userCode }) => {
  const { t } = useTranslation('oauth');

  return (
    <AuthCard
      subtitle={t('device.input.description')}
      title={t('device.input.title')}
      footer={
        <form action="/oidc/device" method="post" style={{ width: '100%' }}>
          {xsrf && <input name="xsrf" type="hidden" value={xsrf} />}
          <div className="flex flex-col gap-4">
            <Input
              autoFocus
              autoComplete="off"
              defaultValue={userCode}
              name="user_code"
              placeholder={t('device.input.placeholder')}
              style={{ fontFamily: 'monospace', letterSpacing: '0.15em', textAlign: 'center' }}
            />
            <Button block htmlType="submit" size="large" type="primary">
              {t('device.input.submit')}
            </Button>
          </div>
        </form>
      }
    >
      {errorKey && (
        <div className="flex flex-col p-4">
          <Text style={{ color: 'red' }}>{t(errorKey as any)}</Text>
        </div>
      )}
    </AuthCard>
  );
});

DeviceCodeInput.displayName = 'DeviceCodeInput';

export default DeviceCodeInput;
