'use client';

import { SiDiscord } from '@icons-pack/react-simple-icons';
import { Button, Text } from '@lobehub/ui/base-ui';
import { SOCIAL_URL } from '@orvilo/business-const';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import AuthCard from '@/features/AuthCard';

const normalizeErrorCode = (code?: string | null) =>
  (code || 'UNKNOWN').trim().toUpperCase().replaceAll('-', '_');

const AuthErrorPage = memo(() => {
  const { t } = useTranslation('authError');
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  const code = normalizeErrorCode(error);
  const description = t(`codes.${code}`, { defaultValue: t('codes.UNKNOWN') });

  return (
    <AuthCard
      subtitle={description}
      title={t('title')}
      footer={
        <div className="flex flex-col gap-3 justify-center flex-wrap">
          <Link to="/signin">
            <Button block size={'large'} type="primary">
              {t('actions.retry')}
            </Button>
          </Link>
          <a href={'/'}>
            <Button block size={'large'}>
              {t('actions.home')}
            </Button>
          </a>
          {/* A deployment without a community server has nowhere to send the
              user — drop the action instead of rendering one that goes nowhere. */}
          {SOCIAL_URL.discord && (
            <a href={SOCIAL_URL.discord} rel="noopener noreferrer" target="_blank">
              <Button block icon={<SiDiscord fill={cssVar.colorText} />} type="text">
                {t('actions.discord')}
              </Button>
            </a>
          )}
        </div>
      }
    >
      <Text style={{ fontFamily: cssVar.fontFamilyCode }} type={'secondary'}>
        ErrorCode: {error || 'UNKNOWN'}
      </Text>
    </AuthCard>
  );
});

AuthErrorPage.displayName = 'AuthErrorPage';

export default AuthErrorPage;
