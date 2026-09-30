'use client';

import { Button } from '@lobehub/ui/base-ui';
import { TRPCClientError } from '@trpc/client';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NotFound from '@/components/404';
import { trackLoginOrSignupClicked } from '@/features/User/UserLoginOrSignup/trackLoginOrSignupClicked';

interface ShareErrorViewProps {
  error: unknown;
}

const ShareErrorView = memo<ShareErrorViewProps>(({ error }) => {
  const { t } = useTranslation('chat');

  const trpcError = error instanceof TRPCClientError ? error : null;
  const errorCode = trpcError?.data?.code;

  if (errorCode === 'UNAUTHORIZED') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12">
        <NotFound
          desc={t('sharePage.error.unauthorized.subtitle')}
          status={''}
          title={t('sharePage.error.unauthorized.title')}
          extra={
            <Button
              href="/signin"
              type="primary"
              onClick={(event) => {
                event.preventDefault();
                const callbackUrl = `${window.location.pathname}${window.location.search}`;
                const target = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
                void trackLoginOrSignupClicked({
                  spm: 'share.unauthorized.signin.click',
                }).finally(() => {
                  window.location.href = target;
                });
              }}
            >
              {t('sharePage.error.unauthorized.action')}
            </Button>
          }
        />
      </div>
    );
  }

  if (errorCode === 'FORBIDDEN') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12">
        <NotFound
          desc={t('sharePage.error.forbidden.subtitle')}
          status={403}
          title={t('sharePage.error.forbidden.title')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-12">
      <NotFound
        desc={t('sharePage.error.notFound.subtitle')}
        title={t('sharePage.error.notFound.title')}
      />
    </div>
  );
});

ShareErrorView.displayName = 'ShareErrorView';

export default ShareErrorView;
