import { cn } from 'cn';
import { CheckIcon, RouterIcon, TerminalIcon } from 'lucide-react';
import React, { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/version';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  active: 'border-primary hover:border-primary',
  container:
    'relative w-full cursor-pointer rounded-(--radius-card) border border-border bg-card p-4 transition-[border-color,box-shadow] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) hover:border-primary-hover',
  disabled:
    'cursor-not-allowed border-border bg-(--surface-disabled) opacity-50 hover:border-border',
};

const twStyles = {
  cardDescription: 'text-xs text-foreground-description',
  cardTitle: 'text-sm font-semibold',
  checkIcon:
    'absolute inset-bs-3 end-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-on-fill',
  featureIcon: 'text-muted-foreground',
  featureItem: 'flex items-center gap-2',
  featureText: 'text-xs text-muted-foreground',
};

// Helper component for feature list items (moved from MCPManifestForm)
const FeatureItem = memo(({ children }: { children: React.ReactNode }) => {
  return (
    <div className={twStyles.featureItem}>
      <div className={cn('flex flex-col items-center justify-center', twStyles.featureIcon)}>
        <CheckIcon className="text-success-text" size={16} />
      </div>
      <div className={twStyles.featureText}>{children}</div>
    </div>
  );
});

interface MCPTypeSelectProps {
  onChange?: (value: string) => void;
  value?: string;
}

const MCPTypeSelect = ({ value, onChange }: MCPTypeSelectProps) => {
  const { t } = useTranslation('plugin');

  const handleSelect = (type: string) => {
    onChange?.(type);
  };

  const data = [
    {
      description: t('dev.mcp.type.httpShortDesc'),
      features: [t('dev.mcp.type.httpFeature1'), t('dev.mcp.type.httpFeature2')],
      icon: RouterIcon,
      label: 'Streamable HTTP',
      value: 'http',
    },
    {
      description: t('dev.mcp.type.stdioShortDesc'),
      features: [t('dev.mcp.type.stdioFeature1'), t('dev.mcp.type.stdioFeature2')],
      icon: TerminalIcon,
      label: 'STDIO',
      value: 'stdio',
    },
  ];

  return (
    <div className="flex w-full gap-4">
      {data.map(({ label, description, features, value: itemValue, icon }) => {
        const isActive = value === itemValue;
        const disabled = itemValue === 'stdio' && !isDesktop;
        return (
          <div
            {...clickableProps(!disabled)}
            aria-disabled={disabled || undefined}
            aria-pressed={isActive}
            data-slot="mcp-type-option"
            key={itemValue}
            className={cn(
              styles.container,
              isActive && !disabled && styles.active,
              disabled && styles.disabled,
              cn('flex min-w-0 flex-1 flex-col gap-3', CLICKABLE_FOCUS_RING),
            )}
            onClick={disabled ? undefined : () => handleSelect(itemValue)}
          >
            <div
              className={cn(
                'flex flex-col items-center justify-center',
                twStyles.checkIcon,
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            >
              <CheckIcon size={16} />
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-5.5 flex-col items-center justify-center">
                {createElement(icon, { size: 16 })}
              </div>
              <div className="flex flex-col">
                <div className={twStyles.cardTitle}>{label}</div>
                <div className={twStyles.cardDescription}>{description}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {features.map((feature) => (
                <FeatureItem key={feature}>{feature}</FeatureItem>
              ))}
            </div>
            {disabled && (
              <div className="mbs-2 text-xs text-warning-text">
                {t('dev.mcp.type.stdioNotAvailable')}
              </div>
            )}
          </div>
        );
      })}
      {/* Streamable HTTP Card */}
    </div>
  );
};

export default MCPTypeSelect;
