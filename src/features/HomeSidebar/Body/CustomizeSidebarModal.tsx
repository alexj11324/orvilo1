'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { t } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  BotIcon,
  Eye,
  EyeOff,
  GitPullRequestIcon,
  Inbox,
  PinIcon,
  RotateCcw,
  SquareUser,
  Star,
  Users,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useGlobalStore } from '@/store/global';
import { DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';
import { getDefaultHiddenSections } from '@/store/global/selectors/systemStatus';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface SidebarSectionConfig {
  /** Core IA entries cannot be hidden — rendered pinned for context. */
  alwaysVisible?: boolean;
  icon: LucideIcon;
  id: string;
  labelKey: string;
  workspaceOnly?: boolean;
}

const SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
  { alwaysVisible: true, icon: Inbox, id: 'inbox', labelKey: 'tab.inbox' },
  { alwaysVisible: true, icon: SquareUser, id: 'my-work', labelKey: 'tab.myWork' },
  { alwaysVisible: true, icon: GitPullRequestIcon, id: 'reviews', labelKey: 'tab.reviews' },
  { alwaysVisible: true, icon: BotIcon, id: 'agent', labelKey: 'navPanel.agent' },
  { icon: PROJECT_ENTITY_ICON, id: 'workspace', labelKey: 'navPanel.workspace' },
  { icon: Star, id: 'favorites', labelKey: 'tab.favorites' },
  { icon: Users, id: 'teams', labelKey: 'navPanel.yourTeams', workspaceOnly: true },
];

/** Sections the customizer offers for the given mode — workspace-only entries
 * are excluded in personal mode rather than shown as dead toggles. */
export const getVisibleSidebarSections = (isWorkspaceMode: boolean): SidebarSectionConfig[] =>
  SIDEBAR_SECTIONS.filter((section) => !section.workspaceOnly || isWorkspaceMode);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = createStaticStyles(({ css }) => ({
  item: css`
    height: 40px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};
  `,
  footer: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding-block-start: 16px;
  `,
}));

// ---------------------------------------------------------------------------
// SectionRow
// ---------------------------------------------------------------------------

const SectionRow = memo<{
  config: SidebarSectionConfig;
  hiddenSections: string[];
  onToggle: (key: string) => void;
}>(({ config, hiddenSections, onToggle }) => {
  const { t } = useTranslation('common');
  const isHidden = hiddenSections.includes(config.id);

  return (
    <div
      className={cx(styles.item, 'flex items-center gap-2 justify-between')}
      style={{ opacity: isHidden ? 0.5 : undefined }}
    >
      <div className="flex items-center gap-2">
        <config.icon size={18} />
        <div>{t(config.labelKey as never)}</div>
      </div>
      {config.alwaysVisible ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <ActionIcon
                    icon={PinIcon}
                    size={'small'}
                    style={{ cursor: 'default', opacity: 0.45 }}
                  />
                </span>
              }
            />
            <TooltipContent>{t('navPanel.pinned' as never)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <ActionIcon
                    icon={isHidden ? EyeOff : Eye}
                    size={'small'}
                    onClick={() => onToggle(config.id)}
                  />
                </span>
              }
            />
            <TooltipContent>
              {t(isHidden ? ('navPanel.hidden' as never) : ('navPanel.visible' as never))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

/**
 * Sidebar customization under the fixed IA contract: core destinations stay
 * pinned, optional sections (workspace / favorites / your teams) can
 * be hidden. Ordering is contract-owned, so there is no drag-sort here.
 */
const CustomizeSidebarContent = memo(() => {
  const { close } = useModalContext();
  const { t: commonT } = useTranslation('common');
  const activeWorkspaceId = useActiveWorkspaceId();
  const storeHiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const isWorkspaceMode = !!useActiveWorkspaceSlug();

  const [hiddenSections, setHiddenSections] = useState<string[]>(storeHiddenSections);
  const [shouldResetExpandedKeys, setShouldResetExpandedKeys] = useState(false);

  const sections = getVisibleSidebarSections(isWorkspaceMode);

  const toggleSection = useCallback((key: string) => {
    setHiddenSections((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }, []);

  const handleResetDefault = useCallback(() => {
    setHiddenSections(getDefaultHiddenSections(isWorkspaceMode));
    setShouldResetExpandedKeys(true);
  }, [isWorkspaceMode]);

  const handleConfirm = useCallback(() => {
    updateSystemStatus(
      {
        hiddenSidebarSections: hiddenSections,
        ...(shouldResetExpandedKeys
          ? {
              // Defaults: no group key added, no team sub-navigation folded.
              sidebarCollapsedKeys: [],
              sidebarExpandedKeys: DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS,
            }
          : {}),
      },
      'customizeSidebar',
    );
    close();
  }, [close, hiddenSections, shouldResetExpandedKeys, updateSystemStatus]);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {sections.map((config) => (
          <SectionRow
            config={config}
            hiddenSections={hiddenSections}
            key={config.id}
            onToggle={toggleSection}
          />
        ))}
      </div>
      <div className={styles.footer}>
        <Button className="w-full" type="button" variant="outline" onClick={handleResetDefault}>
          <RotateCcw data-icon="inline-start" size={14} />
          {commonT('navPanel.resetDefault')}
        </Button>
        <Button className="w-full" type="button" variant="default" onClick={handleConfirm}>
          {commonT('confirm')}
        </Button>
      </div>
    </>
  );
});

// ---------------------------------------------------------------------------
// Modal entry
// ---------------------------------------------------------------------------

export const openCustomizeSidebarModal = (): ModalInstance =>
  createModal({
    content: <CustomizeSidebarContent />,
    footer: null,
    maskClosable: true,
    title: t('navPanel.customizeSidebar', { ns: 'common' }),
    width: 360,
  });
