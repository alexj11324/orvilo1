import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  ChevronDownIcon,
  FolderIcon,
  InfinityIcon,
  MessageCircleIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react';
import { createElement, memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBusinessAgentModeSync } from '@/business/client/hooks/useBusinessAgentMode';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { useEffectiveAgentMode } from '@/features/ChatInput/hooks/useEffectiveAgentMode';
import { useToggleAgentMode } from '@/features/ChatInput/hooks/useToggleAgentMode';
import { usePermission } from '@/hooks/usePermission';

import { SimpleTooltip } from '../../SimpleTooltip';

const styles = createStaticStyles(({ css }) => ({
  activeOption: css`
    background: ${cssVar.colorFillSecondary};
  `,
  agentTooltip: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 160px;
  `,
  agentTooltipCap: css`
    display: flex;
    gap: 6px;
    align-items: center;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  agentTooltipTitle: css`
    margin-block-end: 2px;
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  button: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    height: 28px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  buttonDisabled: css`
    cursor: not-allowed;
    opacity: 0.5;

    &:hover {
      color: ${cssVar.colorTextSecondary};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  option: css`
    cursor: pointer;

    width: 100%;
    padding-block: 10px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    transition: background-color 0.2s;

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  optionDisabled: css`
    cursor: not-allowed;
    opacity: 0.55;

    &:hover {
      background: transparent;
    }
  `,
  optionDesc: css`
    font-size: 12px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  optionIcon: css`
    flex-shrink: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgElevated};
  `,
  optionTitle: css`
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
  popoverPopup: css`
    /* The popup pads its option rows by 4px, so its corner must be one step larger
       than the rows' radius (borderRadius 8 → borderRadiusLG 12 = 8 + 4) to wrap them
       concentrically instead of looking tighter than them. &&& outranks the base
       popup style's border-radius. */
    &&& {
      border-radius: ${cssVar.borderRadiusLG};
    }
  `,
}));

const AGENT_CAPS = [
  { icon: WrenchIcon, key: 'tools' },
  { icon: SearchIcon, key: 'web' },
  { icon: FolderIcon, key: 'files' },
  { icon: TerminalIcon, key: 'env' },
] as const;

const AgentMode = memo(() => {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const toggleAgentMode = useToggleAgentMode();
  useBusinessAgentModeSync(agentId);
  const [open, setOpen] = useState(false);
  const { allowed: canCreateContent, reason } = usePermission('create_content');
  const { canUseResource, isAccessLoading, isGroupContext } = useChatInputResourceAccess();

  const { canSelectAgentMode, currentMode, isAgentModeUnavailable, isPreferenceLoading } =
    useEffectiveAgentMode(agentId);
  const disabled = !canCreateContent || !canUseResource;
  const disabledReason = !canCreateContent
    ? reason
    : t(isGroupContext ? 'input.viewOnlyGroup' : 'input.viewOnlyAgent');
  const CurrentIcon = currentMode === 'agent' ? InfinityIcon : MessageCircleIcon;

  const handleSelect = useCallback(
    async (mode: 'chat' | 'agent') => {
      if (disabled) return;
      if (mode === 'agent' && !canSelectAgentMode) return;

      setOpen(false);
      await toggleAgentMode(mode === 'agent');
    },
    [canSelectAgentMode, disabled, toggleAgentMode],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (disabled) return;

      setOpen(nextOpen);
    },
    [disabled],
  );

  const agentTooltip = (
    <div className={styles.agentTooltip}>
      <div className={styles.agentTooltipTitle}>{t('chatMode.agent')}</div>
      {AGENT_CAPS.map(({ key, icon }) => (
        <div className={styles.agentTooltipCap} key={key}>
          <span className="anticon" role="img">
            {createElement(icon, { size: 12, width: 12, height: 12, fill: 'transparent' })}
          </span>
          {t(`chatMode.agentCap.${key}`)}
        </div>
      ))}
    </div>
  );

  const chatTooltip = t('chatMode.chatDesc');
  const buttonTooltip = isAgentModeUnavailable
    ? t('chatMode.agentUnsupported')
    : currentMode === 'agent'
      ? agentTooltip
      : chatTooltip;
  const agentDesc = canSelectAgentMode ? t('chatMode.agentDesc') : t('chatMode.agentUnsupported');

  const popoverContent = (
    <div className="flex flex-col gap-1" style={{ maxWidth: 320, minWidth: 280 }}>
      <div
        className={cx(
          'flex flex-row items-center gap-3',
          cx(
            styles.option,
            currentMode === 'agent' && styles.activeOption,
            !canSelectAgentMode && styles.optionDisabled,
          ),
        )}
        onClick={() => handleSelect('agent')}
      >
        <div
          className={cx(
            'flex flex-col items-center h-[32px] justify-center w-[32px]',
            styles.optionIcon,
          )}
        >
          <span className="anticon" role="img">
            <InfinityIcon fill={'transparent'} height={16} size={16} width={16} />
          </span>
        </div>
        <div className="flex flex-col flex-1">
          <div className={styles.optionTitle}>{t('chatMode.agent')}</div>
          <div className={styles.optionDesc}>{agentDesc}</div>
        </div>
      </div>

      <div
        className={cx(
          'flex flex-row items-center gap-3',
          cx(styles.option, currentMode === 'chat' && styles.activeOption),
        )}
        onClick={() => handleSelect('chat')}
      >
        <div
          className={cx(
            'flex flex-col items-center h-[32px] justify-center w-[32px]',
            styles.optionIcon,
          )}
        >
          <span className="anticon" role="img">
            <MessageCircleIcon fill={'transparent'} height={16} size={16} width={16} />
          </span>
        </div>
        <div className="flex flex-col flex-1">
          <div className={styles.optionTitle}>{t('chatMode.chat')}</div>
          <div className={styles.optionDesc}>{t('chatMode.chatDesc')}</div>
        </div>
      </div>
    </div>
  );

  const button = (
    <div className={cx(styles.button, disabled && styles.buttonDisabled)}>
      <span className="anticon" role="img">
        <CurrentIcon fill={'transparent'} height={14} size={14} width={14} />
      </span>
      <span>{t(`chatMode.${currentMode}`)}</span>
      <span className="anticon" role="img">
        <ChevronDownIcon fill={'transparent'} height={12} size={12} width={12} />
      </span>
    </div>
  );

  if (isAccessLoading || isPreferenceLoading) return null;

  if (disabled)
    return (
      <SimpleTooltip title={disabledReason}>
        <div>{button}</div>
      </SimpleTooltip>
    );

  return (
    <Popover open={!disabled && open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <div>{open ? button : <SimpleTooltip title={buttonTooltip}>{button}</SimpleTooltip>}</div>
        }
      />
      <PopoverContent
        align={'start'}
        className={cx('w-auto', styles.popoverPopup)}
        side={'bottom'}
        style={{
          // Match the inner viewport's corner to the enlarged popup radius so
          // its border corners don't poke through the rounded popup.
          border: `1px solid ${cssVar.colorBorderSecondary}`,
          borderRadius: cssVar.borderRadiusLG,
          padding: 4,
        }}
      >
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
});

AgentMode.displayName = 'AgentMode';

export default AgentMode;
