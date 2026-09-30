'use client';

import { Result, Text } from '@lobehub/ui/base-ui';
import { CircleCheckIcon } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

const DeviceSuccess = memo(() => {
  const { t } = useTranslation('oauth');

  return (
    <Result
      icon={<CircleCheckIcon size={96} />}
      status="success"
      subTitle={
        <Text fontSize={16} type="secondary">
          {t('device.success.description')}
        </Text>
      }
      title={
        <Text fontSize={32} weight={'bold'}>
          {t('device.success.title')}
        </Text>
      }
    />
  );
});

DeviceSuccess.displayName = 'DeviceSuccess';

export default DeviceSuccess;
