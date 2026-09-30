'use client';

import { Avatar, Button, Skeleton, Text } from '@lobehub/ui/base-ui';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import AuthCard from '@/features/AuthCard';
import { useAuthSession } from '@/libs/auth/session';
import type { OidcClientMetadata } from '@/types/oidc';

import OAuthApplicationLogo from './OAuthApplicationLogo';

interface LoginConfirmProps {
  clientMetadata: OidcClientMetadata;
  uid: string;
}

const LoginConfirmClient = memo<LoginConfirmProps>(({ uid, clientMetadata }) => {
  const { t } = useTranslation('oauth'); // Assuming translations are in 'oauth'

  const clientDisplayName = clientMetadata?.clientName || 'the application';

  const { data: session, isPending } = useAuthSession();
  const isUserStateInit = !isPending && !!session;
  const avatar = session?.user?.avatar || '';
  const nickName = session?.user?.name || '';

  const navigate = useNavigate();

  // The OIDC login prompt presumes a web session — without one, send the user
  // through the accounts portal and return here to finish the interaction.
  React.useEffect(() => {
    if (isPending || session) return;
    navigate(`/signin?callbackUrl=${encodeURIComponent(window.location.href)}`);
  }, [isPending, navigate, session]);

  const [isLoading, setIsLoading] = React.useState(false);

  const titleText = t('login.title', { clientName: clientDisplayName });
  const descriptionText = t('login.description', { clientName: clientDisplayName });
  const buttonText = t('login.button'); // Or "Continue"

  return (
    <div className="flex flex-col gap-4" style={{ width: 'min(100%,400px)' }}>
      <OAuthApplicationLogo
        clientDisplayName={clientDisplayName}
        isFirstParty={clientMetadata.isFirstParty}
        logoUrl={clientMetadata.logo}
      />
      <AuthCard
        subtitle={descriptionText}
        title={titleText}
        footer={
          <form
            action="/oidc/consent"
            method="post"
            style={{ width: '100%' }}
            onSubmit={() => setIsLoading(true)}
          >
            {/* Adjust action URL */}
            <input name="uid" type="hidden" value={uid} />
            <input name="consent" type="hidden" value="accept" />
            {/* Single confirmation button */}
            <Button
              block
              data-testid="oauth-consent-accept"
              disabled={!isUserStateInit}
              htmlType="submit"
              loading={isLoading}
              size="large"
              type="primary"
            >
              {buttonText}
            </Button>
          </form>
        }
      >
        <div
          className="flex flex-col p-4 border"
          style={{ borderColor: cssVar.colorBorderSecondary, background: cssVar.colorBgContainer }}
        >
          {isUserStateInit ? (
            <div className="flex items-center gap-4">
              <Avatar alt={nickName || ''} avatar={avatar} shape={'square'} size={40} />
              <Text fontSize={18} weight={500}>
                {nickName}
              </Text>
            </div>
          ) : (
            <div className="flex gap-4">
              <Skeleton.Avatar shape={'square'} size={40} />
              <Skeleton height={36} />
            </div>
          )}
        </div>
      </AuthCard>
    </div>
  );
});

LoginConfirmClient.displayName = 'LoginConfirmClient';

export default LoginConfirmClient;
