'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { omit } from 'es-toolkit/compat';
import { SearchIcon, Users } from 'lucide-react';
import { type ChangeEvent, type ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import ImperativeModal from '@/components/ImperativeModal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_AVATAR } from '@/const/meta';
import GroupAvatar from '@/features/GroupAvatar';
import { useSessionStore } from '@/store/session';
import { type OrviloAgentSession } from '@/types/session';
import { OrviloSessionType } from '@/types/session';

import { type GroupTemplate } from './templates';
import { useGroupTemplates } from './templates';

const TemplateItem = memo<{
  cx: (..._args: any[]) => string;
  isSelected: boolean;
  onToggle: (_templateId: string) => void;
  styles: Record<string, string>;
  template: GroupTemplate;
}>(({ template, isSelected, onToggle, styles, cx }) => {
  const { t } = useTranslation('chat');

  return (
    <div className={cx(styles.listItem)} onClick={() => onToggle(template.id)}>
      <div className={'flex gap-3 items-center'}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggle(template.id)}
          onClick={(e) => e.stopPropagation()}
        />
        <GroupAvatar
          size={40}
          avatars={template.members
            .filter((member) => member !== null && member !== undefined)
            .map((member) => ({
              avatar: member.avatar || DEFAULT_AVATAR,
              background: member.backgroundColor || undefined,
            }))}
        />
        <div className={'flex flex-1 flex-col'} style={{ gap: 2 }}>
          <div className={cn(styles.title)}>{template.title}</div>
          <div className={cn('truncate min-w-0', styles.description)}>{template.description}</div>
          <div className={'flex gap-1 items-center'}>
            <Users size={11} style={{ color: '#999' }} />
            <div className="text-muted-foreground" style={{ fontSize: 11 }}>
              {t('groupWizard.memberCount', {
                count: template.members.filter((member) => member !== null && member !== undefined)
                  .length,
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const ExistingMemberItem = memo<{
  agent: OrviloAgentSession;
  cx: (..._args: any[]) => string;
  isSelected: boolean;
  onToggle: (_agentId: string) => void;
  styles: Record<string, string>;
}>(({ agent, isSelected, onToggle, styles, cx }) => {
  const { t } = useTranslation(['chat', 'common']);
  const agentId = agent.config?.id;
  const title = agent.meta?.title || t('defaultSession', { ns: 'common' });
  const description = agent.meta?.description || '';
  const avatar = agent.meta?.avatar || DEFAULT_AVATAR;
  const avatarBackground = agent.meta?.backgroundColor;

  if (!agentId) return null;

  return (
    <div className={cx(styles.listItem)} onClick={() => onToggle(agentId)}>
      <div className={'flex gap-3 items-center'}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggle(agentId)}
          onClick={(e) => e.stopPropagation()}
        />
        <Avatar avatar={avatar} background={avatarBackground} size={40} />
        <div className={'flex flex-1 flex-col'} style={{ gap: 2, minWidth: 0 }}>
          <div className={cn(styles.title)}>{title}</div>
          {description && (
            <div className={cn('truncate min-w-0', styles.description)}>{description}</div>
          )}
        </div>
      </div>
    </div>
  );
});

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: row;

    height: 500px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};
  `,
  description: css`
    font-size: 12px;
    line-height: 1.2;
    color: ${cssVar.colorTextSecondary};
  `,
  hostCard: css`
    margin-block-start: ${cssVar.paddingSM};
    margin-inline: ${cssVar.paddingSM};
    padding: ${cssVar.padding};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorFillTertiary};
  `,
  leftColumn: css`
    user-select: none;

    overflow-y: auto;
    flex: 1;

    padding: 0;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  listHeader: css`
    padding: 0;
    color: ${cssVar.colorTextDescription};
  `,
  listItem: css`
    cursor: pointer;

    position: relative;

    margin-block: 2px;
    padding: ${cssVar.paddingSM} !important;
    border-radius: ${cssVar.borderRadius};

    transition: all 0.2s ease;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  memberDescription: css`
    display: block;
    padding-inline-end: 48px;
  `,
  rightColumn: css`
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;

    padding: 0;
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
  `,
}));

export interface ChatGroupWizardProps {
  /**
   * External loading state for template creation (controlled by parent)
   */
  isCreatingFromTemplate?: boolean;
  onCancel: () => void;
  onCreateCustom: (selectedAgents: string[]) => void | Promise<void>;
  onCreateFromTemplate: (
    templateId: string,
    selectedMemberTitles?: string[],
  ) => void | Promise<void>;
  open: boolean;
}

const ChatGroupWizard = memo<ChatGroupWizardProps>(
  ({
    onCancel,
    onCreateFromTemplate,
    onCreateCustom,
    open,
    isCreatingFromTemplate: externalLoading,
  }) => {
    const { t } = useTranslation(['chat', 'common']);
    const groupTemplates = useGroupTemplates();
    const agentSessions = useSessionStore((s) =>
      (s.sessions || []).filter((session) => session.type === OrviloSessionType.Agent),
    );

    const visibleAgentSessions = useMemo(
      () => agentSessions.filter((session) => !session.config?.virtual),
      [agentSessions],
    );

    const memberDescriptionClass = cx(styles.description, styles.memberDescription);

    const [inputValue, setInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
    const [removedMembers, setRemovedMembers] = useState<Record<string, string[]>>({});
    const [isHostRemoved, setIsHostRemoved] = useState(false);
    const [isCreatingCustom, setIsCreatingCustom] = useState(false);
    const [activePanel, setActivePanel] = useState<'templates' | 'agents'>('templates');

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isCreatingFromTemplate = externalLoading ?? false;

    const handleTemplateToggle = useCallback((templateId: string) => {
      setSelectedTemplate((prev) => {
        const next = prev === templateId ? '' : templateId;

        if (next !== prev) {
          setRemovedMembers({});
          setIsHostRemoved(false);
        }

        if (next) {
          setSelectedAgents([]);
        }

        return next;
      });
    }, []);

    const handleAgentToggle = useCallback((agentId: string) => {
      setSelectedTemplate('');
      setRemovedMembers({});
      setSelectedAgents((prev) =>
        prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
      );
    }, []);

    const handleRemoveAgent = useCallback((agentId: string) => {
      setSelectedAgents((prev) => prev.filter((id) => id !== agentId));
    }, []);

    const handleReset = useCallback(() => {
      setSelectedTemplate('');
      setSelectedAgents([]);
      setInputValue('');
      setSearchTerm('');
      setRemovedMembers({});
      setIsHostRemoved(false);

      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    }, []);

    const handleToggleMember = useCallback(
      (templateId: string, memberTitle: string, enabled: boolean) => {
        setRemovedMembers((prev) => {
          const current = prev[templateId] || [];

          if (enabled) {
            const next = current.filter((title) => title !== memberTitle);

            if (next.length === 0) {
              return omit(prev, [templateId]);
            }

            return { ...prev, [templateId]: next };
          }

          if (current.includes(memberTitle)) return prev;

          return {
            ...prev,
            [templateId]: [...current, memberTitle],
          };
        });
      },
      [],
    );

    const handleHostToggle = useCallback((enabled: boolean) => {
      setIsHostRemoved(!enabled);
    }, []);

    const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setInputValue(value);

      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer to update searchTerm after 300ms
      debounceTimerRef.current = setTimeout(() => {
        setSearchTerm(value);
      }, 300);
    }, []);

    const agentCount = visibleAgentSessions.length;

    // Cleanup debounce timer on unmount
    useEffect(() => {
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (!open) return;

      setActivePanel(agentCount > 2 ? 'agents' : 'templates');
    }, [open, agentCount]);

    useEffect(() => {
      setSelectedAgents((prev) =>
        prev.filter((id) => visibleAgentSessions.some((session) => session.config?.id === id)),
      );
    }, [visibleAgentSessions]);

    const handlePanelChange = useCallback((keys: string[]) => {
      const nextKey = keys[0];

      if (nextKey === 'templates' || nextKey === 'agents') {
        setActivePanel(nextKey);
      }
    }, []);

    const filteredTemplates = useMemo(() => {
      const searchLower = searchTerm.trim().toLowerCase();
      if (!searchLower) return groupTemplates;

      return groupTemplates.filter((template) => {
        if (template.title.toLowerCase().includes(searchLower)) return true;
        if (template.description.toLowerCase().includes(searchLower)) return true;

        return template.members.some(
          (member) =>
            member !== null &&
            member !== undefined &&
            member.title.toLowerCase().includes(searchLower),
        );
      });
    }, [groupTemplates, searchTerm]);

    const filteredAgents = useMemo(() => {
      const searchLower = searchTerm.trim().toLowerCase();
      if (!searchLower) return visibleAgentSessions;

      return visibleAgentSessions.filter((agent) => {
        const title = agent.meta?.title || '';
        const description = agent.meta?.description || '';

        return (
          title.toLowerCase().includes(searchLower) ||
          description.toLowerCase().includes(searchLower)
        );
      });
    }, [visibleAgentSessions, searchTerm]);

    const templateMemberItems = useMemo(() => {
      if (!selectedTemplate) return [];

      const template = groupTemplates.find((t) => t.id === selectedTemplate);
      if (!template) return [];

      const removedForTemplate = new Set(removedMembers[selectedTemplate] || []);

      return template.members
        .filter((member) => member !== null && member !== undefined)
        .map((member) => ({
          avatar: member.avatar || DEFAULT_AVATAR,
          backgroundColor: member.backgroundColor,
          description: member.systemRole,
          isRemoved: removedForTemplate.has(member.title),
          key: `${selectedTemplate}-${member.title}`,
          systemRole: member.systemRole,
          title: member.title,
        }));
    }, [selectedTemplate, removedMembers, groupTemplates]);

    const activeTemplateMembersCount = useMemo(
      () => templateMemberItems.filter((member) => !member.isRemoved).length,
      [templateMemberItems],
    );

    const selectedAgentListItems = useMemo(() => {
      return selectedAgents
        .map((agentId) => {
          const agent = agentSessions.find((session) => session.config?.id === agentId);
          if (!agent) return null;

          const title = agent.meta?.title || t('defaultSession', { ns: 'common' });
          const avatar = agent.meta?.avatar || DEFAULT_AVATAR;
          const avatarBackground = agent.meta?.backgroundColor;
          const description = agent.meta?.description || '';

          return {
            actions: (
              <Switch
                checked
                size="sm"
                onCheckedChange={(checked) => {
                  if (!checked) handleRemoveAgent(agentId);
                }}
              />
            ),
            avatar: <Avatar avatar={avatar} background={avatarBackground} size={40} />,
            description: description ? (
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <div className={cn('line-clamp-1', memberDescriptionClass)}>{description}</div>
                </TooltipTrigger>
                <TooltipContent>{description}</TooltipContent>
              </Tooltip>
            ) : null,
            key: agentId,
            showAction: true,
            title,
          };
        })

        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    }, [selectedAgents, agentSessions, t, handleRemoveAgent, memberDescriptionClass]);

    const handleTemplateConfirm = useCallback(async () => {
      if (!selectedTemplate) return;

      try {
        // collect selected member titles (not removed)
        const template = groupTemplates.find((t) => t.id === selectedTemplate);
        const removedForTemplate = new Set(removedMembers[selectedTemplate] || []);
        const selectedMemberTitles = (template?.members || [])
          .filter((m) => m !== null && m !== undefined && !removedForTemplate.has(m.title))
          .map((m) => m.title);

        await onCreateFromTemplate(selectedTemplate, selectedMemberTitles);
        handleReset();
      } catch (error) {
        console.error('Failed to create group from template:', error);
      }
    }, [selectedTemplate, onCreateFromTemplate, groupTemplates, removedMembers, handleReset]);

    const handleCustomConfirm = useCallback(async () => {
      if (selectedAgents.length === 0) return;

      try {
        setIsCreatingCustom(true);
        await onCreateCustom(selectedAgents);
        handleReset();
        onCancel();
      } catch (error) {
        console.error('Failed to create group with selected members:', error);
      } finally {
        setIsCreatingCustom(false);
      }
    }, [selectedAgents, onCreateCustom, onCancel, handleReset]);

    const handleConfirm = useCallback(async () => {
      if (selectedTemplate) {
        await handleTemplateConfirm();
        return;
      }

      await handleCustomConfirm();
    }, [selectedTemplate, handleTemplateConfirm, handleCustomConfirm]);

    const handleCancel = () => {
      handleReset();
      onCancel();
    };

    const confirmDisabled = selectedTemplate
      ? activeTemplateMembersCount === 0 && isHostRemoved
      : selectedAgents.length === 0;

    const confirmLoading = selectedTemplate ? isCreatingFromTemplate : isCreatingCustom;

    return (
      <ImperativeModal
        open={open}
        title={t('groupWizard.title')}
        width={900}
        footer={
          <div className={'flex gap-2 justify-end'}>
            <Button onClick={handleCancel}>{t('cancel', { ns: 'common' })}</Button>
            <Button disabled={confirmDisabled} loading={confirmLoading} onClick={handleConfirm}>
              {t('groupWizard.createGroup')}
            </Button>
          </div>
        }
        onCancel={handleCancel}
      >
        <div className={cn('flex', styles.container)}>
          <div className={cn('flex flex-col gap-3 flex-1', styles.leftColumn)}>
            <div
              className={'relative'}
              style={{ margin: `${cssVar.paddingSM} ${cssVar.paddingSM} 0 ${cssVar.paddingSM}` }}
            >
              <SearchIcon
                className={
                  'text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2'
                }
              />
              <Input
                className={'pl-8'}
                placeholder={t('memberSelection.searchAgents')}
                value={inputValue}
                onChange={handleSearchChange}
              />
            </div>
            <div
              className={'flex flex-1 flex-col'}
              style={{ overflowY: 'auto', padding: `0 ${cssVar.paddingSM}` }}
            >
              <Accordion value={[activePanel]} onValueChange={handlePanelChange}>
                {(
                  [
                    {
                      children:
                        filteredTemplates.length === 0 ? (
                          <Empty style={{ maxWidth: 400 }}>
                            <EmptyHeader>
                              <EmptyMedia variant={'icon'}>
                                <Users />
                              </EmptyMedia>
                              <EmptyDescription style={{ fontSize: 14 }}>
                                {searchTerm
                                  ? t('groupWizard.noMatchingTemplates')
                                  : t('groupWizard.noTemplates')}
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          <div className={'flex flex-col gap-1'}>
                            {filteredTemplates.map((template) => (
                              <TemplateItem
                                cx={cx}
                                isSelected={selectedTemplate === template.id}
                                key={template.id}
                                styles={styles}
                                template={template}
                                onToggle={handleTemplateToggle}
                              />
                            ))}
                          </div>
                        ),
                      key: 'templates',
                      title: t('groupWizard.useTemplate'),
                    },
                    {
                      children:
                        filteredAgents.length === 0 ? (
                          <Empty style={{ maxWidth: 400 }}>
                            <EmptyHeader>
                              <EmptyMedia variant={'icon'}>
                                <Users />
                              </EmptyMedia>
                              <EmptyDescription style={{ fontSize: 14 }}>
                                {searchTerm
                                  ? t('noMatchingAgents', { ns: 'chat' })
                                  : t('noAvailableAgents', { ns: 'chat' })}
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          <div className={'flex flex-col gap-1'}>
                            {filteredAgents.map((agent) => (
                              <ExistingMemberItem
                                agent={agent}
                                cx={cx}
                                isSelected={selectedAgents.includes(agent.config?.id || '')}
                                key={agent.id}
                                styles={styles}
                                onToggle={handleAgentToggle}
                              />
                            ))}
                          </div>
                        ),
                      key: 'agents',
                      title: t('groupWizard.existingMembers'),
                    },
                  ] as { children: ReactNode; key: string; title: ReactNode }[]
                ).map((item) => (
                  <AccordionItem key={item.key} value={item.key}>
                    <AccordionTrigger>{item.title}</AccordionTrigger>
                    <AccordionContent>{item.children}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>

          <div className={cn('flex flex-1 flex-col', styles.rightColumn)}>
            <div className={'flex flex-col gap-4 flex-1'} style={{ overflowY: 'auto' }}>
              <div className={cn('flex gap-3 items-center', styles.hostCard)}>
                <div className={'flex flex-1 flex-col'} style={{ gap: 2 }}>
                  <div
                    className={isHostRemoved ? 'text-muted-foreground' : undefined}
                    style={{ fontSize: 14, fontWeight: 500 }}
                  >
                    {t('groupWizard.host.title')}
                  </div>
                  <div
                    className={isHostRemoved ? 'text-muted-foreground' : undefined}
                    style={{ color: isHostRemoved ? undefined : '#999', fontSize: 12 }}
                  >
                    {t('groupWizard.host.description')}
                  </div>
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

              <div className={'flex flex-col'} style={{ padding: `0 ${cssVar.paddingSM}` }}>
                {selectedTemplate ? (
                  templateMemberItems.length > 0 ? (
                    <div className={'flex w-full flex-col'}>
                      {templateMemberItems
                        .map((member) => ({
                          actions: (
                            <Switch
                              checked={!member.isRemoved}
                              size="sm"
                              onCheckedChange={(checked) =>
                                handleToggleMember(selectedTemplate, member.title, checked)
                              }
                            />
                          ),
                          avatar: (
                            <Avatar
                              avatar={member.avatar}
                              background={member.backgroundColor}
                              size={40}
                            />
                          ),
                          description: member.systemRole ? (
                            <Tooltip>
                              <TooltipTrigger render={<span />}>
                                <div
                                  className={cn(
                                    'line-clamp-1',
                                    memberDescriptionClass,
                                    member.isRemoved && 'text-muted-foreground',
                                  )}
                                >
                                  {member.systemRole}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>{member.systemRole}</TooltipContent>
                            </Tooltip>
                          ) : null,
                          key: member.key,
                          showAction: true,
                          title: (
                            <div className={member.isRemoved ? 'text-muted-foreground' : undefined}>
                              {member.title}
                            </div>
                          ),
                        }))
                        .map((item) => (
                          <div className={'flex items-center gap-3 py-2'} key={item.key}>
                            {item.avatar}
                            <div className={'flex flex-1 flex-col'}>
                              {item.title}
                              {item.description}
                            </div>
                            {item.showAction !== false && item.actions}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <Empty style={{ maxWidth: 400 }}>
                      <EmptyHeader>
                        <EmptyMedia variant={'icon'}>
                          <Users />
                        </EmptyMedia>
                        <EmptyDescription style={{ fontSize: 14 }}>
                          {t('groupWizard.noTemplateMembers')}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )
                ) : selectedAgentListItems.length > 0 ? (
                  <div className={'flex w-full flex-col'}>
                    {selectedAgentListItems.map((item) => (
                      <div className={'flex items-center gap-3 py-2'} key={item.key}>
                        {item.avatar}
                        <div className={'flex flex-1 flex-col'}>
                          {item.title}
                          {item.description}
                        </div>
                        {item.showAction !== false && item.actions}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty style={{ maxWidth: 400 }}>
                    <EmptyHeader>
                      <EmptyMedia variant={'icon'}>
                        <Users />
                      </EmptyMedia>
                      <EmptyDescription style={{ fontSize: 14 }}>
                        {t('memberSelection.noSelectedAgents')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </div>
          </div>
        </div>
      </ImperativeModal>
    );
  },
);

export default ChatGroupWizard;
