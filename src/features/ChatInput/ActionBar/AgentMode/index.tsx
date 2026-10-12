import { cn } from 'cn';
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
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { SimpleTooltip } from '../../SimpleTooltip';

const styles = {
  activeOption: 'bg-selected hover:bg-selected',
  agentTooltip: 'flex flex-col gap-1 min-w-40',
  agentTooltipCap: 'flex gap-1.5 items-center text-xs leading-5 text-muted-foreground',
  agentTooltipTitle: 'mbe-0.5 text-sm leading-5.5 font-semibold text-foreground',
  button:
    'cursor-pointer flex gap-1.5 items-center h-8 px-2 rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground bg-secondary transition-[color,background-color] duration-(--orvilo-motion-mid) motion-reduce:transition-none hover:text-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]',
  buttonDisabled: 'cursor-not-allowed opacity-50 hover:text-muted-foreground hover:bg-accent',
  option:
    'cursor-pointer w-full py-2.5 px-2 rounded-(--radius-button) transition-[background-color] duration-(--orvilo-motion-mid) motion-reduce:transition-none hover:bg-accent',
  optionDisabled: 'cursor-not-allowed opacity-50 hover:bg-transparent',
  optionDesc: 'text-xs leading-5 text-foreground-description',
  optionIcon: 'flex-none rounded-(--radius-card) border border-divider bg-popover',
  optionTitle: 'text-sm leading-5.5 font-medium text-foreground',
};

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
            {createElement(icon, { size: 16, width: 16, height: 16, fill: 'transparent' })}
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
    <div className="flex flex-col gap-1 min-w-70 max-w-80">
      <div
        {...clickableProps()}
        className={cn(
          cn(
            'flex flex-row items-center gap-3',
            cn(
              styles.option,
              currentMode === 'agent' && styles.activeOption,
              !canSelectAgentMode && styles.optionDisabled,
            ),
          ),
          CLICKABLE_FOCUS_RING,
        )}
        onClick={() => handleSelect('agent')}
      >
        <div className={cn('flex flex-col items-center h-8 justify-center w-8', styles.optionIcon)}>
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
        {...clickableProps()}
        className={cn(
          cn(
            'flex flex-row items-center gap-3',
            cn(styles.option, currentMode === 'chat' && styles.activeOption),
          ),
          CLICKABLE_FOCUS_RING,
        )}
        onClick={() => handleSelect('chat')}
      >
        <div className={cn('flex flex-col items-center h-8 justify-center w-8', styles.optionIcon)}>
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
    <div className={cn(styles.button, disabled && styles.buttonDisabled)}>
      <span className="anticon" role="img">
        <CurrentIcon fill={'transparent'} height={16} size={16} width={16} />
      </span>
      <span>{t(`chatMode.${currentMode}`)}</span>
      <span className="anticon" role="img">
        <ChevronDownIcon fill={'transparent'} height={16} size={16} width={16} />
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
        className={cn('inline-flex pointer-coarse:p-1.5', CLICKABLE_FOCUS_RING)}
        nativeButton={false}
        render={
          <div>{open ? button : <SimpleTooltip title={buttonTooltip}>{button}</SimpleTooltip>}</div>
        }
      />
      <PopoverContent
        align={'start'}
        className={'w-auto rounded-(--radius-overlay) border border-divider p-1'}
        side={'bottom'}
      >
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
});

AgentMode.displayName = 'AgentMode';

export default AgentMode;
