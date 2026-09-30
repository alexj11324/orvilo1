'use client';

import { SiGithub, SiX } from '@icons-pack/react-simple-icons';
import { cssVar } from 'antd-style';
import { ArrowRight, Link2Off, Loader2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Spinner as Spin } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { type SocialProfile, type SocialProvider } from './useSocialConnect';

interface SocialConnectButtonProps {
  disabled?: boolean;
  isConnecting?: boolean;
  isDisconnecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  profile: SocialProfile | null;
  provider: SocialProvider;
}

const providerIcons: Record<SocialProvider, React.ComponentType<{ size?: number }>> = {
  github: SiGithub,
  twitter: SiX,
};

const providerNames: Record<SocialProvider, string> = {
  github: 'GitHub',
  twitter: 'X (Twitter)',
};

export const SocialConnectButton = memo<SocialConnectButtonProps>(
  ({ provider, profile, isConnecting, isDisconnecting, disabled, onConnect, onDisconnect }) => {
    const { t } = useTranslation('marketAuth');
    const ProviderIcon = providerIcons[provider];
    const providerName = providerNames[provider];

    const isLoading = isConnecting || isDisconnecting;
    const isDisabled = isLoading || disabled;

    if (profile) {
      // Connected state
      return (
        <div
          className="flex items-center justify-between gap-3"
          style={{
            background: cssVar.colorFillQuaternary,
            borderRadius: cssVar.borderRadiusLG,
            padding: '8px 12px',
          }}
        >
          <div className="flex items-center gap-2">
            <ProviderIcon size={18} />
            <div className="flex flex-col gap-0.5">
              <div style={{ fontSize: 13 }}>@{profile.username}</div>
              <div className="text-muted-foreground" style={{ fontSize: 11 }}>
                {t('profileSetup.socialLinks.connected', {
                  defaultValue: 'Connected',
                })}
              </div>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ActionIcon
                    disabled={isDisabled}
                    icon={isDisconnecting ? Loader2 : Link2Off}
                    loading={isDisconnecting}
                    size="small"
                    onClick={onDisconnect}
                  />
                }
              />
              <TooltipContent>
                {t('profileSetup.socialLinks.disconnect', { defaultValue: 'Disconnect' })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    // Not connected state
    return (
      <Button
        className="w-full"
        disabled={isDisabled}
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 8,
          height: 40,
          justifyContent: 'flex-start',
          paddingLeft: 12,
        }}
        onClick={onConnect}
      >
        {isConnecting ? <Spin className="size-4" /> : <ProviderIcon size={16} />}
        <div className="flex flex-1 items-center justify-between">
          <span>
            {isConnecting
              ? t('profileSetup.socialLinks.connecting', { defaultValue: 'Connecting...' })
              : t('profileSetup.socialLinks.connectProvider', {
                  defaultValue: `Connect ${providerName}`,
                  provider: providerName,
                })}
          </span>
          {!isConnecting && <ArrowRight size={14} style={{ opacity: 0.5 }} />}
        </div>
      </Button>
    );
  },
);

SocialConnectButton.displayName = 'SocialConnectButton';

export default SocialConnectButton;
