'use client';

import { agentDisplayName } from '@orvilo/types';
import { useHover } from 'ahooks';
import { clsx as cx, cn } from 'cn';
import { SearchIcon, X } from 'lucide-react';
import { type ChangeEvent } from 'react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import ImperativeModal from '@/components/ImperativeModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_AVATAR } from '@/const/meta';
import AgentSelectionEmpty from '@/features/AgentSelectionEmpty';
import { useSessionStore } from '@/store/session';
import { type OrviloAgentSession } from '@/types/session';
import { OrviloSessionType } from '@/types/session';

const AvailableAgentItem = memo<{
  agent: OrviloAgentSession;
  cx: any;
  isSelected: boolean;
  onToggle: (_agentId: string) => void;
  styles: any;
  t: any;
}>(({ agent, isSelected, onToggle, styles, cx, t }) => {
  const ref = useRef(null);
  const isHovering = useHover(ref);

  const _agentId = agent.config?.id;
  const title = agentDisplayName(agent.meta, t('defaultSession', { ns: 'common' }));
  const description = agent.meta?.description || '';
  const avatar = agent.meta?.avatar || DEFAULT_AVATAR;
  const avatarBackground = agent.meta?.backgroundColor;

  if (!_agentId) return null;

  return (
    <div
      className={cx(styles.listItem, isSelected ? styles.selectedItem : 'hover:bg-accent')}
      ref={ref}
      onClick={() => onToggle(_agentId)}
    >
      <div className={'flex gap-3 items-center'}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {
            onToggle(_agentId);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
        <div className={'flex flex-none flex-col'}>
          <Avatar animation={isHovering} avatar={avatar} background={avatarBackground} size={40} />
        </div>
        <div className={'flex min-w-0 flex-1 flex-col gap-0.5'}>
          <div className={styles.title}>{title}</div>
          {description && (
            <div className={cn('truncate min-w-0', styles.description)}>{description}</div>
          )}
        </div>
      </div>
    </div>
  );
});

const styles = {
  container: 'flex h-125 flex-row rounded-(--radius-card) border border-divider',
  description: 'text-xs leading-5 text-muted-foreground',
  hostCard: 'mbe-3 rounded-(--radius-card) border border-divider bg-muted p-4',
  leftColumn: 'flex-1 select-none overflow-y-auto border-e border-divider px-3 pbs-3 pbe-0',
  listItem:
    'relative my-0.5 cursor-pointer rounded-(--radius-card) p-3 transition-[background-color] duration-(--orvilo-motion-mid) ease-[ease]',
  rightColumn: 'flex-1 overflow-y-auto p-3',
  selectedItem: 'bg-selected hover:bg-selected',
  title: 'text-sm leading-5.5 font-semibold',
};

export type MemberSelectionMode = 'create' | 'add';

export interface MemberSelectionModalProps {
  /**
   * Current host configuration (for add mode)
   */
  currentHostConfig?: {
    enableSupervisor?: boolean;
    orchestratorModel?: string;
    orchestratorProvider?: string;
  };
  /**
   * Existing group members to exclude from available agents (for add mode)
   */
  existingMembers?: string[];
  /**
   * Group ID for add mode (required when mode is 'add')
   */
  groupId?: string;
  /**
   * The mode of the modal:
   * - 'create': For selecting initial members when creating a new group
   * - 'add': For adding members to an existing group
   */
  mode: MemberSelectionMode;
  onCancel: () => void;
  onConfirm: (selectedAgents: string[]) => void | Promise<void>;
  open: boolean;
  /**
   * Pre-selected agent IDs (useful for editing existing groups)
   */
  preSelectedAgents?: string[];
}

const MemberSelectionModal = memo<MemberSelectionModalProps>(
  ({
    currentHostConfig,
    existingMembers = [],
    mode,
    onCancel,
    onConfirm,
    open,
    preSelectedAgents = [],
  }) => {
    const { t } = useTranslation(['chat', 'common']);
    const [selectedAgents, setSelectedAgents] = useState<string[]>(preSelectedAgents);
    const [searchTerm, setSearchTerm] = useState('');

    // Determine if host card should be shown
    const isHostCurrentlyEnabled = mode === 'add' && currentHostConfig?.enableSupervisor === true;

    // Initialize host state:
    // - In create mode: default to enabled (isHostRemoved = false)
    // - In add mode with host disabled: default to disabled (isHostRemoved = true)
    const [isHostRemoved, setIsHostRemoved] = useState(mode === 'add' ? true : false);

    const agentSessions = useSessionStore((s) => {
      const allSessions = s.sessions || [];
      return allSessions.filter(
        (session): session is OrviloAgentSession =>
          session.type === OrviloSessionType.Agent && !session.config?.virtual,
      );
    });

    const currentSessionId = useSessionStore((s) => s.activeId);

    const handleAgentToggle = (agentId: string) => {
      setSelectedAgents((prev) =>
        prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
      );
    };

    const handleRemoveAgent = useCallback((agentId: string) => {
      setSelectedAgents((prev) => prev.filter((id) => id !== agentId));
    }, []);

    const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
    }, []);

    const handleHostToggle = useCallback((enabled: boolean) => {
      setIsHostRemoved(!enabled);
    }, []);

    // Filter logic based on mode
    const availableAgents = useMemo(() => {
      if (mode === 'create') {
        // When creating a new group, all agents are available
        return agentSessions;
      } else {
        // When adding to existing group, filter out the current session and existing members
        return agentSessions.filter(
          (agent) =>
            agent.id !== currentSessionId && !existingMembers.includes(agent.config?.id || ''),
        );
      }
    }, [agentSessions, currentSessionId, mode, existingMembers]);

    // Filter available agents based on search term
    const filteredAvailableAgents = useMemo(() => {
      if (!searchTerm.trim()) return availableAgents;

      return availableAgents.filter((agent) => {
        const title = agentDisplayName(agent.meta) ?? '';
        const description = agent.meta?.description || '';
        const searchLower = searchTerm.toLowerCase();

        return (
          title.toLowerCase().includes(searchLower) ||
          description.toLowerCase().includes(searchLower)
        );
      });
    }, [availableAgents, searchTerm]);

    const selectedAgentListItems = useMemo(() => {
      return selectedAgents
        .map((agentId) => {
          const agent = agentSessions.find((session) => session.config.id === agentId);
          if (!agent) return null;

          const title = agentDisplayName(agent.meta, t('defaultSession', { ns: 'common' }));
          const avatar = agent.meta?.avatar || DEFAULT_AVATAR;
          const avatarBackground = agent.meta?.backgroundColor;
          const description = agent.meta?.description || '';

          return {
            actions: (
              <ActionIcon
                aria-label={t('remove', { ns: 'common' })}
                className="text-muted-foreground"
                icon={X}
                size={{ blockSize: 28, borderRadius: 'var(--radius-input)', size: 14 }}
                onClick={() => handleRemoveAgent(agentId)}
              />
            ),
            avatar: (
              <Avatar avatar={avatar} background={avatarBackground} shape="circle" size={40} />
            ),
            description,
            key: agentId,
            showAction: true,
            title,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    }, [selectedAgents, agentSessions, t, handleRemoveAgent]);

    const handleReset = () => {
      setSelectedAgents(preSelectedAgents);
      setSearchTerm('');
      setIsHostRemoved(mode === 'add' ? true : false);
    };

    const [isAdding, setIsAdding] = useState(false);

    const handleConfirm = async () => {
      try {
        setIsAdding(true);
        await onConfirm(selectedAgents);
        handleReset();
      } catch (error) {
        console.error('Failed to confirm action:', error);
      } finally {
        setIsAdding(false);
      }
    };

    const handleCancel = () => {
      handleReset();
      onCancel();
    };

    // Dynamic content based on mode
    const modalTitle =
      mode === 'create' ? t('memberSelection.setInitialMembers') : t('memberSelection.addMember');

    const confirmButtonText =
      mode === 'create' ? t('memberSelection.createGroup') : t('memberSelection.addMember');

    // Calculate total member count including host if enabled
    // Only count the host when the host card is visible (create mode or add mode with host disabled)
    const shouldShowHostCard = !isHostCurrentlyEnabled;
    const totalMemberCount = selectedAgents.length + (shouldShowHostCard && !isHostRemoved ? 1 : 0);

    const minMembersRequired = mode === 'create' ? 1 : 0; // At least 1 member for group creation
    const isConfirmDisabled = totalMemberCount < minMembersRequired || isAdding;

    return (
      <ImperativeModal
        allowFullscreen
        open={open}
        title={modalTitle}
        width={1024}
        footer={
          <div className={'flex gap-2 justify-end'}>
            <Button size="lg" type="button" onClick={handleCancel}>
              {t('cancel', { ns: 'common' })}
            </Button>
            <Button
              disabled={isConfirmDisabled}
              loading={isAdding}
              size="lg"
              type="button"
              onClick={handleConfirm}
            >
              {confirmButtonText} ({totalMemberCount})
            </Button>
          </div>
        }
        onCancel={handleCancel}
      >
        <div className={cn('flex', styles.container)}>
          {/* Left Column - Available Agents */}
          <div className={cn('flex flex-col gap-3 flex-1', styles.leftColumn)}>
            <div className={'relative'}>
              <SearchIcon
                className={
                  'text-muted-foreground absolute inset-bs-1/2 start-2.5 size-4 -translate-y-1/2'
                }
              />
              <Input
                className={'ps-8'}
                placeholder={t('memberSelection.searchAgents')}
                value={searchTerm}
                visualSize="compact"
                onChange={handleSearchChange}
              />
            </div>

            <div className={'flex flex-1 flex-col overflow-y-auto'}>
              {filteredAvailableAgents.length === 0 ? (
                <AgentSelectionEmpty
                  search={Boolean(searchTerm)}
                  variant={searchTerm ? 'empty' : 'noAvailable'}
                />
              ) : (
                <div>
                  {filteredAvailableAgents.map((agent) => {
                    const agentId = agent.config?.id;
                    if (!agentId) return null;

                    const isSelected = selectedAgents.includes(agentId);

                    return (
                      <AvailableAgentItem
                        agent={agent}
                        cx={cx}
                        isSelected={isSelected}
                        key={agentId}
                        styles={styles}
                        t={t}
                        onToggle={handleAgentToggle}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Host and Selected Agents */}
          <div className={cn('flex flex-1 flex-col', styles.rightColumn)}>
            <div className={'flex flex-col gap-4'}>
              {/* Host Card - Only show in create mode or when host is disabled in add mode */}
              {!isHostCurrentlyEnabled && (
                <div className={cn('flex gap-3 items-center', styles.hostCard)}>
                  <div className={'flex flex-1 flex-col gap-0.5'}>
                    <div className={cn(styles.title, isHostRemoved && 'text-muted-foreground')}>
                      {t('groupWizard.host.title')}
                    </div>
                    <div className={styles.description}>{t('groupWizard.host.description')}</div>
                  </div>
                  <div className={'flex gap-3 items-center'}>
                    <Tooltip>
                      <TooltipTrigger render={<span />}>
                        <Switch
                          checked={!isHostRemoved}
                          size="sm"
                          onCheckedChange={(checked) => handleHostToggle(checked)}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{t('groupWizard.host.tooltip')}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}

              {/* Selected Agents List */}
              <div className={'flex flex-1 flex-col'}>
                {selectedAgentListItems.length === 0 ? (
                  <AgentSelectionEmpty variant="noSelected" />
                ) : (
                  <div className={'flex w-full flex-col'}>
                    {selectedAgentListItems.map((item) => (
                      <div className={'flex items-center gap-3 py-2'} key={item.key}>
                        {item.avatar}
                        <div className={'flex flex-1 flex-col'}>
                          <span className={styles.title}>{item.title}</span>
                          <span className={styles.description}>{item.description}</span>
                        </div>
                        {item.showAction !== false && item.actions}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </ImperativeModal>
    );
  },
);

export default MemberSelectionModal;
