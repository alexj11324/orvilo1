'use client';

import { BRANDING_PROVIDER } from '@orvilo/business-const';
import { BASE_PROVIDER_DOC_URL } from '@orvilo/const';
import { cn } from 'cn';
import { ExternalLinkIcon, InfoIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import Avatar from '@/components/Avatar';
import { ProviderCombine, ProviderIcon } from '@/components/OrviloIcons';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import EnableSwitch from './EnableSwitch';
import UpdateProviderInfo from './UpdateProviderInfo';

export type ProviderStatus = 'disabled' | 'enabled' | 'notConfigured';

/** Identity block (logo and name) shared by the page header and the OAuth card. */
export const ProviderIdentity = ({
  enabled,
  id,
  isCustom,
  isOAuthProvider,
  logoUrl,
  name,
  title,
}: {
  enabled: boolean;
  id: string;
  isCustom: boolean;
  isOAuthProvider: boolean;
  logoUrl?: string;
  name?: string;
  title?: ReactNode;
}) => (
  <div
    className={cn(
      'flex min-h-8 items-center gap-2',
      // OAuth providers keep full-colour branding while off: the enable
      // switch sits right beside them, so dimming only adds noise
      !enabled && !isOAuthProvider && 'opacity-66 grayscale',
    )}
  >
    {isCustom ? (
      <>
        {logoUrl ? (
          <Avatar avatar={logoUrl} shape={'circle'} size={32} title={name || id} />
        ) : (
          <ProviderCombine provider={'not-exist-provider'} size={24} />
        )}
        <span className="text-xl leading-7 font-semibold">{name}</span>
      </>
    ) : (
      (title ??
      // OAuth providers sell a subscription plan rather than the vendor
      // platform, so the plan name reads truer than the vendor wordmark
      // the combined logo would render (e.g. ChatGPT vs. OpenAI).
      (isOAuthProvider ? (
        <>
          <ProviderIcon
            provider={id}
            shape={'square'}
            size={24}
            style={{ borderRadius: 6 }}
            type={'avatar'}
          />
          <span className="text-xl leading-7 font-semibold">{name}</span>
        </>
      ) : (
        <span className="text-foreground">
          <ProviderCombine provider={id} size={24} />
          <span className="sr-only">{name}</span>
        </span>
      )))
    )}
  </div>
);

export const HelpDocLink = ({ id }: { id: string }) => {
  const { t } = useTranslation('modelProvider');

  return (
    <Button
      render={<a href={urlJoin(BASE_PROVIDER_DOC_URL, id)} rel="noreferrer" target="_blank" />}
      size="sm"
      variant="ghost"
    >
      {t('providerModels.config.helpDoc')}
      <ExternalLinkIcon />
    </Button>
  );
};

const STATUS_VARIANT = {
  disabled: 'secondary',
  enabled: 'success-light',
  notConfigured: 'outline',
} as const;

interface ProviderHeaderProps {
  canDeactivate: boolean;
  description?: string;
  enableBusinessFeatures: boolean;
  enabled: boolean;
  extra?: ReactNode;
  id: string;
  identity: ReactNode;
  isCustom: boolean;
  isOAuthProvider: boolean;
  status: ProviderStatus;
}

/** Actions on the right of the header: shared by the page header and the OAuth card. */
export const ProviderHeaderActions = ({
  canDeactivate,
  enableBusinessFeatures,
  extra,
  id,
  isCustom,
  isOAuthProvider,
  withHelpDoc,
}: Pick<
  ProviderHeaderProps,
  'canDeactivate' | 'enableBusinessFeatures' | 'extra' | 'id' | 'isCustom' | 'isOAuthProvider'
> & { withHelpDoc?: boolean }) => {
  const { t } = useTranslation('modelProvider');

  return (
    <div className="flex flex-none items-center gap-2">
      {withHelpDoc && !isCustom && <HelpDocLink id={id} />}
      {extra}
      {isCustom && <UpdateProviderInfo />}
      {canDeactivate && !(enableBusinessFeatures && id === BRANDING_PROVIDER) && (
        <>
          {/* OAuth providers pair the switch with a connect action, so the
              built-in notice would crowd the row */}
          {!isCustom && !isOAuthProvider && (
            <Tooltip>
              <TooltipTrigger
                aria-label={t('providerModels.config.builtinNotice')}
                className="inline-flex text-muted-foreground"
                render={<span tabIndex={0} />}
              >
                <InfoIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>{t('providerModels.config.builtinNotice')}</TooltipContent>
            </Tooltip>
          )}
          <EnableSwitch id={id} key={id} />
        </>
      )}
    </div>
  );
};

const ProviderHeader = (props: ProviderHeaderProps) => {
  const { description, identity, status } = props;
  const { t } = useTranslation('modelProvider');

  const statusLabel = {
    disabled: t('menu.list.disabled'),
    enabled: t('menu.list.enabled'),
    notConfigured: t('providerModels.config.status.notConfigured'),
  }[status];

  return (
    <header className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0">{identity}</h1>
          <Badge variant={STATUS_VARIANT[status]}>{statusLabel}</Badge>
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <ProviderHeaderActions {...props} withHelpDoc />
    </header>
  );
};

export default ProviderHeader;
