import { cn } from 'cn';
import {
  CheckIcon,
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
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { useEffectiveAgentMode } from '@/features/ChatInput/hooks/useEffectiveAgentMode';
import { useToggleAgentMode } from '@/features/ChatInput/hooks/useToggleAgentMode';
import { usePermission } from '@/hooks/usePermission';

import { SimpleTooltip } from '../SimpleTooltip';

const styles = {
  activeOption: 'bg-muted bg-none hover:bg-muted hover:bg-none',
  agentTooltip: 'flex flex-col gap-1 min-w-40',
  agentTooltipCap: 'flex gap-1.5 items-center text-[12px] text-muted-foreground',
  agentTooltipTitle: 'mbe-0.5 text-[12px] font-semibold text-foreground',
  button:
    'cursor-pointer flex flex-none gap-1.5 items-center py-0.5 px-1 rounded-(--radius-chip) text-[12px] text-muted-foreground whitespace-nowrap [transition:all_0.2s] hover:text-foreground hover:bg-accent hover:bg-none',
  buttonOpen: 'text-foreground bg-muted bg-none hover:text-foreground hover:bg-muted hover:bg-none',
  buttonDisabled:
    'cursor-not-allowed opacity-50 hover:text-muted-foreground hover:bg-transparent hover:bg-none',
  option:
    'cursor-pointer justify-start w-full h-auto py-2.5 px-2 rounded-[calc(var(--radius)_-_2px)] text-start whitespace-normal [transition:background-color_0.2s] hover:bg-selected hover:bg-none',
  optionDisabled: 'cursor-not-allowed opacity-55 hover:bg-transparent hover:bg-none',
  optionDesc: 'text-[12px] leading-[1.4] text-[var(--ant-color-text-description)]',
  optionIcon:
    'shrink-0 border border-solid border-sidebar-border rounded-(--radius-card) bg-popover bg-none',
  optionTitle: 'text-[14px] font-medium leading-[1.4] text-foreground',
  popoverPopup: 'rounded-(--radius-overlay)',
};

const AGENT_CAPS = [
  { icon: WrenchIcon, key: 'tools' },
  { icon: SearchIcon, key: 'web' },
  { icon: FolderIcon, key: 'files' },
  { icon: TerminalIcon, key: 'env' },
] as const;

const ModeSelector = memo(() => {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const toggleAgentMode = useToggleAgentMode();
  useBusinessAgentModeSync(agentId);
  const [open, setOpen] = useState(false);
  const { allowed: canCreateContent, reason } = usePermission('create_content');
  // Agent/Chat mode is a caller runtime preference for ordinary Workspace
  // members; only members who cannot use the Agent are disabled.
  const { canUseResource, isGroupContext } = useChatInputResourceAccess();
  const disabled = !canCreateContent || !canUseResource;
  const disabledReason = !canCreateContent
    ? reason
    : t(isGroupContext ? 'input.viewOnlyGroup' : 'input.viewOnlyAgent');

  const { canSelectAgentMode, currentMode, isAgentModeUnavailable, isPreferenceLoading } =
    useEffectiveAgentMode(agentId);
  const CurrentIcon = currentMode === 'agent' ? InfinityIcon : MessageCircleIcon;

  const handleSelect = useCallback(
    async (mode: 'chat' | 'agent') => {
      if (disabled) return;
      if (mode === 'agent' && !canSelectAgentMode) return;

      setOpen(false);
      await toggleAgentMode(mode === 'agent');
    },
    [disabled, canSelectAgentMode, toggleAgentMode],
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
      <Button
        aria-current={currentMode === 'agent' ? 'true' : undefined}
        disabled={!canSelectAgentMode}
        variant="ghost"
        className={cn(
          'flex flex-row items-center gap-3',
          cn(
            styles.option,
            !canSelectAgentMode && styles.optionDisabled,
            currentMode === 'agent' && styles.activeOption,
          ),
        )}
        onClick={() => handleSelect('agent')}
      >
        <div
          className={cn(
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
        {currentMode === 'agent' ? <CheckIcon aria-hidden size={14} /> : null}
      </Button>

      <Button
        aria-current={currentMode === 'chat' ? 'true' : undefined}
        variant="ghost"
        className={cn(
          'flex flex-row items-center gap-3',
          cn(styles.option, currentMode === 'chat' && styles.activeOption),
        )}
        onClick={() => handleSelect('chat')}
      >
        <div
          className={cn(
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
        {currentMode === 'chat' ? <CheckIcon aria-hidden size={14} /> : null}
      </Button>
    </div>
  );

  const button = (
    <div
      className={cn(
        styles.button,
        open && !disabled && styles.buttonOpen,
        disabled && styles.buttonDisabled,
      )}
    >
      <span className="anticon" role="img">
        <CurrentIcon fill={'transparent'} height={14} size={14} width={14} />
      </span>
      <span>{t(`chatMode.${currentMode}`)}</span>
      <span className="anticon" role="img">
        <ChevronDownIcon fill={'transparent'} height={12} size={12} width={12} />
      </span>
    </div>
  );

  if (isPreferenceLoading) return null;

  if (disabled)
    return (
      <SimpleTooltip title={disabledReason}>
        <div>{button}</div>
      </SimpleTooltip>
    );

  return (
    <Popover open={!disabled && open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        {open ? button : <SimpleTooltip title={buttonTooltip}>{button}</SimpleTooltip>}
      </PopoverTrigger>
      <PopoverContent
        align={'start'}
        className={cn('w-auto border border-solid border-sidebar-border p-1', styles.popoverPopup)}
        side={'top'}
      >
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
});

ModeSelector.displayName = 'ModeSelector';

export default ModeSelector;
