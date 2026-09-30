'use client';

import React, { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AuthCard from '@/features/AuthCard';
import type { OidcClientMetadata } from '@/types/oidc';

import OAuthApplicationLogo from '../OAuthApplicationLogo';
import ThirdPartyNotice from '../ThirdPartyNotice';
import BuiltinConsent from './BuiltinConsent';

interface ClientProps {
  clientId: string;
  clientMetadata: OidcClientMetadata;
  redirectUri?: string;
  scopes: string[];
  uid: string;
}

/**
 * Get the description for a scope
 */
function getScopeDescription(scope: string, t: any): string {
  return t(`consent.scope.${scope.replace(':', '-')}`, scope);
}

const BUILTIN_CLIENTS = new Set(['orvilo-desktop', 'orvilo-mobile', 'orvilo-market']);

const ConsentClient = memo<ClientProps>(({ uid, clientId, scopes, clientMetadata }) => {
  const { t } = useTranslation('oauth');

  const [isLoading, setIsLoading] = useState(false);
  const consentInputRef = useRef<HTMLInputElement>(null);

  const clientDisplayName = clientMetadata?.clientName || clientId;

  if (BUILTIN_CLIENTS.has(clientId)) {
    return <BuiltinConsent uid={uid} />;
  }

  return (
    <div className="flex flex-col gap-4" style={{ width: 'min(100%,400px)' }}>
      <OAuthApplicationLogo
        clientDisplayName={clientDisplayName}
        isFirstParty={clientMetadata.isFirstParty}
        logoUrl={clientMetadata.logo}
      />
      <AuthCard
        subtitle={t('consent.description', { clientName: clientDisplayName })}
        title={t('consent.title', { clientName: clientDisplayName })}
        footer={
          <form action="/oidc/consent" method="post" style={{ width: '100%' }}>
            <input name="uid" type="hidden" value={uid} />
            <input defaultValue="accept" name="consent" ref={consentInputRef} type="hidden" />
            <div className="flex flex-col gap-3">
              <Button
                data-testid="oauth-consent-accept"
                loading={isLoading}
                size="lg"
                type="submit"
                variant="default"
                onClick={() => {
                  if (consentInputRef.current) consentInputRef.current.value = 'accept';
                  setIsLoading(true);
                }}
              >
                {t('consent.buttons.accept')}
              </Button>
              <Button
                data-testid="oauth-consent-deny"
                size="lg"
                type="submit"
                onClick={() => {
                  if (consentInputRef.current) consentInputRef.current.value = 'deny';
                }}
              >
                {t('consent.buttons.deny')}
              </Button>
            </div>
          </form>
        }
      >
        {clientMetadata.isFirstParty === false && (
          <div className="flex flex-col" style={{ marginBottom: 16 }}>
            <ThirdPartyNotice
              developerName={clientMetadata.developerName}
              policyUri={clientMetadata.policyUri}
            />
          </div>
        )}
        <div className="text-[16px] text-muted-foreground">{t('consent.permissionsTitle')}</div>
        <div className="flex flex-col gap-1 w-full" style={{ marginTop: 8 }}>
          {scopes.map((scope) => (
            <div className="flex flex-col p-4" key={scope}>
              <div>{getScopeDescription(scope, t)}</div>
            </div>
          ))}
        </div>
      </AuthCard>
    </div>
  );
});

ConsentClient.displayName = 'ConsentClient';

export default ConsentClient;
