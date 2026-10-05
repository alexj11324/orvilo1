'use client';

import { PreviewCard } from '@base-ui/react/preview-card';
import { SkillsIcon } from '@lobehub/ui/icons';
import { agentDisplayName, type AgentItem } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { BookOpen, FileText, Settings } from 'lucide-react';
import { memo, type PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import ActionIcon from '@/components/ActionIcon';
import { ArticleSkeleton } from '@/components/Skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { agentProfileKeys } from '@/libs/swr/keys';
import { agentService } from '@/services/agent';

import AgentProfileCard from '.';

const styles = createStaticStyles(({ css, cssVar }) => ({
  footer: css`
    padding-block: 12px;
    padding-inline: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  statItem: css`
    color: ${cssVar.colorTextSecondary};
  `,
  trigger: css`
    border-radius: ${cssVar.borderRadius};

    &[data-popup-open] {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

type AgentPreview = Pick<
  AgentItem,
  'avatar' | 'backgroundColor' | 'description' | 'name' | 'provider' | 'title'
>;

interface FetchedAgent extends Partial<AgentPreview> {
  files?: unknown[];
  id?: string;
  knowledgeBases?: unknown[];
  plugins?: string[];
}

interface AgentProfilePopupProps extends PropsWithChildren {
  /** Prefilled data for instant render; fetched data overrides once loaded. */
  agent?: Partial<AgentPreview>;
  agentId: string;
  /** When set, enables group-specific actions (settings nav). */
  groupId?: string;
  trigger?: 'click' | 'hover';
}

const AgentProfilePopup = memo<AgentProfilePopupProps>(
  ({ agent, agentId, groupId, children, trigger = 'click' }) => {
    const { t } = useTranslation('chat');
    const navigate = useWorkspaceAwareNavigate();
    const [open, setOpen] = useState(false);
    const { allowed: canEditContent } = usePermission('edit_own_content');
    const { canEditResource: canEditAgent, isAccessResolved: isAgentAccessResolved } =
      useResourceAccess('agent', open ? agentId : undefined);
    const { canEditResource: canEditGroup, isAccessResolved: isGroupAccessResolved } =
      useResourceAccess('agentGroup', open ? groupId : undefined);
    const canConfigure =
      canEditContent &&
      isAgentAccessResolved &&
      canEditAgent &&
      (!groupId || (isGroupAccessResolved && canEditGroup));

    const { data: fetched, isLoading } = useSWR(
      open && canConfigure ? agentProfileKeys.detail(agentId) : null,
      () => agentService.getAgentConfigById(agentId) as Promise<FetchedAgent | null>,
      { revalidateOnFocus: false },
    );

    const merged: Partial<AgentPreview> = {
      avatar: fetched?.avatar ?? agent?.avatar,
      backgroundColor: fetched?.backgroundColor ?? agent?.backgroundColor,
      description: fetched?.description ?? agent?.description,
      name: fetched?.name ?? agent?.name,
      provider: fetched?.provider ?? agent?.provider,
      title: fetched?.title ?? agent?.title,
    };

    const handleSettings = () => {
      if (!groupId || !canConfigure) return;
      if (!canConfigure) return;
      setOpen(false);
      navigate(`/group/${groupId}/profile?tab=${agentId}`);
    };

    const handleHeaderClick = () => {
      setOpen(false);
      navigate(`/settings/agents/${agentId}`);
    };

    const hasDisplay = Boolean(agentDisplayName(merged) || merged.avatar || merged.description);
    const showSkeleton = !hasDisplay && isLoading;

    const pluginCount = fetched?.plugins?.length ?? 0;
    const knowledgeCount = fetched?.knowledgeBases?.length ?? 0;
    const fileCount = fetched?.files?.length ?? 0;
    const hasStats = pluginCount > 0 || knowledgeCount > 0 || fileCount > 0;

    const footerLoading = canConfigure && !groupId && isLoading && !fetched;

    const statsSection = footerLoading ? (
      <div className={`flex items-center gap-3.5 ${styles.footer}`}>
        <Skeleton style={{ height: 16, width: 90 }} />
        <Skeleton style={{ height: 16, width: 60 }} />
      </div>
    ) : canConfigure && hasStats ? (
      <div className={`flex items-center gap-3.5 flex-wrap ${styles.footer}`}>
        {pluginCount > 0 && (
          <div className={`flex items-center gap-1 ${styles.statItem}`}>
            <SkillsIcon size={13} />
            <div className="text-[12px] text-muted-foreground">
              {t('agentProfile.skills', { count: pluginCount })}
            </div>
          </div>
        )}
        {knowledgeCount > 0 && (
          <div className={`flex items-center gap-1 ${styles.statItem}`}>
            <BookOpen size={13} />
            <div className="text-[12px] text-muted-foreground">
              {t('agentProfile.knowledgeBases', { count: knowledgeCount })}
            </div>
          </div>
        )}
        {fileCount > 0 && (
          <div className={`flex items-center gap-1 ${styles.statItem}`}>
            <FileText size={13} />
            <div className="text-[12px] text-muted-foreground">
              {t('agentProfile.files', { count: fileCount })}
            </div>
          </div>
        )}
      </div>
    ) : null;

    const content = showSkeleton ? (
      <div style={{ padding: 16, width: 280 }}>
        <ArticleSkeleton avatar rows={2} />
      </div>
    ) : (
      <AgentProfileCard
        avatar={merged.avatar}
        backgroundColor={merged.backgroundColor}
        description={merged.description}
        loading={isLoading && !merged.description}
        title={agentDisplayName(merged, t('defaultSession', { ns: 'common' }))}
        headerAction={
          groupId && canConfigure ? (
            <div className="flex items-center justify-end" style={{ paddingBlockStart: 0 }}>
              <ActionIcon
                icon={Settings}
                size="small"
                title={t('groupSidebar.agentProfile.settings')}
                onClick={handleSettings}
              />
            </div>
          ) : undefined
        }
        onHeaderClick={canConfigure ? handleHeaderClick : undefined}
      >
        {statsSection}
      </AgentProfileCard>
    );

    if (trigger === 'hover')
      return (
        <PreviewCard.Root open={open} onOpenChange={setOpen}>
          <PreviewCard.Trigger render={<span>{children}</span>} />
          <PreviewCard.Portal>
            <PreviewCard.Positioner className={POPUP_Z_CLASS} side={'top'} sideOffset={4}>
              <PreviewCard.Popup
                className={
                  'w-auto overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10'
                }
              >
                {content}
              </PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<span className={styles.trigger}>{children}</span>} />
        <PopoverContent className={'w-auto overflow-hidden rounded-xl p-0'} side={'right'}>
          {content}
        </PopoverContent>
      </Popover>
    );
  },
);

export default AgentProfilePopup;
