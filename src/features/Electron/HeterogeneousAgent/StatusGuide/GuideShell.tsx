import { cssVar } from 'antd-style';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import type { HeterogeneousAgentStatusGuideVariant } from './types';

interface GuideShellProps {
  actions?: ReactNode;
  children?: ReactNode;
  /**
   * Tighter spacing + smaller avatar/title. Used by transient states (e.g. the
   * overloaded auto-retry progress card) that should read as a lightweight
   * status, not a full error panel.
   */
  compact?: boolean;
  headerDescription?: ReactNode;
  icon: ReactNode;
  onDismiss?: () => void;
  title: string;
  variant: HeterogeneousAgentStatusGuideVariant;
}

const GuideShell = ({
  actions,
  children,
  compact = false,
  headerDescription,
  icon,
  onDismiss,
  title,
  variant,
}: GuideShellProps) => {
  const { t } = useTranslation('common');
  const showHeader = variant !== 'embedded';
  // Compact cards keep actions alongside the status when space permits,
  // wrapping them below it in narrow conversation panes.
  const actionsInHeader = compact && showHeader;
  const content = (
    <div className="flex flex-col" style={{ gap: compact ? 8 : 12 }}>
      {showHeader ? (
        <div
          className="flex items-center justify-between"
          style={{ gap: compact ? 8 : 12, ...(compact ? { flexWrap: 'wrap' } : undefined) }}
        >
          <div
            className="flex items-center"
            style={{ gap: compact ? 8 : 12, flex: compact ? '1 1 260px' : undefined, minWidth: 0 }}
          >
            <Avatar
              avatar={icon}
              background={cssVar.colorFillQuaternary}
              shape={'square'}
              size={compact ? 32 : 48}
              style={{ color: cssVar.colorText }}
            />
            <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
              <div style={{ fontSize: compact ? 14 : 16, fontWeight: 600 }}>{title}</div>
              {headerDescription}
            </div>
          </div>
          {(actionsInHeader || onDismiss) && (
            <div
              className="flex items-center gap-2"
              style={{ flexShrink: 0, marginInlineStart: 'auto', maxWidth: '100%' }}
            >
              {actionsInHeader && actions}
              {onDismiss && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          <ActionIcon
                            aria-label={t('close')}
                            icon={X}
                            size="small"
                            onClick={onDismiss}
                          />
                        </span>
                      }
                    />
                    <TooltipContent>{t('close')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </div>
      ) : (
        headerDescription
      )}

      {children}
      {!actionsInHeader && actions}
    </div>
  );

  if (variant !== 'inline') return content;

  return (
    <div
      className="flex flex-col border"
      style={{
        gap: compact ? 12 : 16,
        padding: compact ? 12 : 16,
        borderColor: cssVar.colorBorderSecondary,
        background: cssVar.colorBgContainer,
        background: cssVar.colorBgElevated,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {content}
    </div>
  );
};

export default GuideShell;
