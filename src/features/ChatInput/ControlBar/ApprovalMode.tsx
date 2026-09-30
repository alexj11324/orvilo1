import { createStaticStyles, cx } from 'antd-style';
import { Check, ChevronDown, Hand, ListChecks, Zap } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { useUserStore } from '@/store/user';
import { toolInterventionSelectors } from '@/store/user/selectors';
import { type ApprovalMode } from '@/store/user/slices/settings/selectors';

import { SimpleTooltip } from '../SimpleTooltip';

const styles = createStaticStyles(({ css, cssVar }) => ({
  desc: css`
    font-size: 12px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  icon: css`
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgElevated};
  `,
  modeButton: css`
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextSecondary};
  `,
  modeButtonDisabled: css`
    cursor: not-allowed;
    opacity: 0.5;
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
  trigger: css`
    overflow: hidden;
    border-radius: ${cssVar.borderRadius};
  `,
}));

const ModeItemLabel = memo<{ desc: string; icon: LucideIcon; title: string }>(
  ({ desc, icon, title }) => (
    <div className="flex flex-row items-start gap-3">
      <div
        className={cx(
          'flex flex-col items-center justify-center flex-none h-[32px] w-[32px]',
          styles.icon,
        )}
      >
        <span className="anticon" role="img">
          {createElement(icon, { size: '1em', width: '1em', height: '1em', fill: 'transparent' })}
        </span>
      </div>
      <div className="flex flex-col flex-1" style={{ minWidth: 120 }}>
        <div className={styles.title}>{title}</div>
        <div className={styles.desc}>{desc}</div>
      </div>
    </div>
  ),
);

const ModeSelector = memo(() => {
  const { t } = useTranslation('chat');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { allowed: canCreateContent, reason } = usePermission('create_content');
  // View-only General access: nothing can be sent from this input, so the
  // approval-mode picker is inert too (disabled, not hidden).
  const { canUseResource, isGroupContext } = useChatInputResourceAccess();
  const disabled = !canCreateContent || !canUseResource;
  const approvalMode = useUserStore(toolInterventionSelectors.approvalMode);
  const updateHumanIntervention = useUserStore((s) => s.updateHumanIntervention);

  const modeLabels = useMemo(
    () => ({
      'allow-list': t('tool.intervention.mode.allowList'),
      'auto-run': t('tool.intervention.mode.autoRun'),
      'manual': t('tool.intervention.mode.manual'),
    }),
    [t],
  );

  const handleModeChange = useCallback(
    async (mode: ApprovalMode) => {
      if (disabled) return;

      await updateHumanIntervention({ approvalMode: mode });
    },
    [disabled, updateHumanIntervention],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (disabled) return;

      setDropdownOpen(nextOpen);
    },
    [disabled],
  );

  const menuItems = useCallback(
    (): { extra?: ReactNode; key: string; label: ReactNode; onClick?: () => void }[] => [
      {
        extra:
          approvalMode === 'auto-run' ? (
            <span className="anticon" role="img">
              <Check fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ) : undefined,
        key: 'auto-run',
        label: (
          <ModeItemLabel
            desc={t('tool.intervention.mode.autoRunDesc')}
            icon={Zap}
            title={modeLabels['auto-run']}
          />
        ),
        onClick: () => handleModeChange('auto-run'),
      },
      {
        extra:
          approvalMode === 'allow-list' ? (
            <span className="anticon" role="img">
              <Check fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ) : undefined,
        key: 'allow-list',
        label: (
          <ModeItemLabel
            desc={t('tool.intervention.mode.allowListDesc')}
            icon={ListChecks}
            title={modeLabels['allow-list']}
          />
        ),
        onClick: () => handleModeChange('allow-list'),
      },
      {
        extra:
          approvalMode === 'manual' ? (
            <span className="anticon" role="img">
              <Check fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ) : undefined,
        key: 'manual',
        label: (
          <ModeItemLabel
            desc={t('tool.intervention.mode.manualDesc')}
            icon={Hand}
            title={modeLabels.manual}
          />
        ),
        onClick: () => handleModeChange('manual'),
      },
    ],
    [approvalMode, modeLabels, handleModeChange, t],
  );

  const button = (
    <Button className={styles.modeButton} disabled={disabled} size="sm" variant="ghost">
      {modeLabels[approvalMode]}
      <ChevronDown data-icon="inline-end" />
    </Button>
  );

  if (disabled)
    return (
      <SimpleTooltip
        title={
          !canCreateContent
            ? reason
            : t(isGroupContext ? 'input.viewOnlyGroup' : 'input.viewOnlyAgent')
        }
      >
        <div className={styles.modeButtonDisabled}>{button}</div>
      </SimpleTooltip>
    );

  return (
    <DropdownMenu open={!disabled && dropdownOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={
          <div className={styles.trigger}>
            {dropdownOpen ? (
              button
            ) : (
              <SimpleTooltip title={t('tool.intervention.approvalMode')}>{button}</SimpleTooltip>
            )}
          </div>
        }
      />
      <DropdownMenuContent align={'end'} className={'w-auto min-w-56'} side={'bottom'}>
        {menuItems().map((item) => (
          <DropdownMenuItem key={item.key} onClick={item.onClick}>
            <div className="flex flex-1 flex-row items-center justify-between gap-2">
              {item.label}
              {item.extra}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export default ModeSelector;
