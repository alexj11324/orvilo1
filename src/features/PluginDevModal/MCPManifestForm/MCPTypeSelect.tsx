import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { CheckIcon, RouterIcon, TerminalIcon } from 'lucide-react';
import React, { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/version';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

// Define styles using antd-style (moved from MCPManifestForm)
const styles = createStaticStyles(({ css }) => ({
  active: css`
    border-color: ${cssVar.colorPrimary};

    &:hover {
      border-color: ${cssVar.colorPrimary};
    }
  `,
  container: css`
    cursor: pointer;

    position: relative;

    width: 100%;
    padding-block: 16px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: var(--radius-card);

    background-color: ${cssVar.colorBgContainer};

    transition:
      border-color ${cssVar.motionDurationFast} ${cssVar.motionEaseInOut},
      box-shadow ${cssVar.motionDurationFast} ${cssVar.motionEaseInOut};

    &:hover {
      border-color: ${cssVar.colorPrimaryHover};
    }
  `,
  disabled: css`
    cursor: not-allowed;
    border-color: ${cssVar.colorBorder};
    opacity: 0.5;
    background-color: ${cssVar.colorBgContainerDisabled};

    &:hover {
      border-color: ${cssVar.colorBorder};
    }
  `,
}));

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
            data-slot="mcp-type-option"
            key={itemValue}
            style={{ flex: 1 }} // Make cards take equal width
            className={cx(
              styles.container,
              isActive && styles.active,
              disabled && styles.disabled,
              cn('flex flex-col gap-3', CLICKABLE_FOCUS_RING),
            )}
            onClick={disabled ? undefined : () => handleSelect(itemValue)}
          >
            <div
              className={cn('flex flex-col items-center justify-center', twStyles.checkIcon)}
              style={{ opacity: isActive ? 1 : 0 }}
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
