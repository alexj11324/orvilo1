'use client';

import { DiscordIcon, GithubIcon } from '@lobehub/ui/icons';
import { SOCIAL_URL } from '@orvilo/business-const';
import {
  Book,
  CircleHelp,
  Download,
  Feather,
  FileClockIcon,
  Settings2,
  SettingsIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import ActionIcon from '@/components/ActionIcon';
import { openChangelogModal } from '@/components/ChangelogModal';
import { openFeedbackModal } from '@/components/FeedbackModal';
import { DOCUMENTS_REFER_URL, GITHUB } from '@/const/url';
import Billboard from '@/features/Billboard';
import { useBillboardMenuItems } from '@/features/Billboard/MenuItems';
import SidebarDropdownMenu, {
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useActiveNavKey } from '@/features/NavPanel/useActiveNavKey';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import UserAvatar from '@/features/User/UserAvatar';
import UserPanel from '@/features/User/UserPanel';
import ThemeButton from '@/features/User/UserPanel/ThemeButton';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useNavLayout } from '@/hooks/useNavLayout';
import { useAnalytics } from '@/libs/analytics/client';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors/general';

type FooterMenuItems = SidebarMenuItems;

/**
 * Wrap each clickable menu item with a unified click tracker, preserving any
 * existing onClick. Skips dividers and items without a key. Used to measure
 * which footer menu entries get clicked (breakdown by `key`).
 */
const injectMenuTracking = (
  items: FooterMenuItems,
  track: (key: string) => void,
): FooterMenuItems =>
  items.map((item) => {
    if (!item || (item as { type?: string }).type === 'divider') return item;
    const key = (item as { key?: string | number }).key;
    if (!key) return item;
    const originalOnClick = (item as { onClick?: (info: unknown) => void }).onClick;
    return {
      ...item,
      onClick: (info: unknown) => {
        track(String(key));
        originalOnClick?.(info);
      },
    };
  });

/**
 * Collect the keys of click-trackable items — the exact same set wrapped by
 * `injectMenuTracking` (non-divider items with a key). Used so the menu-open
 * exposure event reports only keys that can later emit `home_footer_menu_clicked`,
 * keeping per-key CTR denominators and numerators aligned. Billboard items are
 * excluded here (they emit their own `billboard_*` events).
 */
const collectMenuKeys = (items: FooterMenuItems): string[] =>
  items
    .filter((item) => item && (item as { type?: string }).type !== 'divider')
    .map((item) => (item as { key?: string | number }).key)
    .filter((key): key is string | number => Boolean(key))
    .map(String);

const Footer = memo(() => {
  const { t } = useTranslation('common');
  const { analytics } = useAnalytics();
  const { footer } = useNavLayout();
  const hasActiveWorkspace = useHasActiveWorkspace();
  const settingLabelKey = hasActiveWorkspace ? 'userPanel.workspaceSetting' : 'userPanel.setting';
  const activeNavKey = useActiveNavKey();
  const isHomeSidebar = activeNavKey === 'home';
  const billboardMenuItems = useBillboardMenuItems();
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);

  const trackMenuClick = useCallback(
    (key: string) => {
      try {
        analytics?.track({
          name: 'home_footer_menu_clicked',
          properties: { key, spm: `homepage.footer.${key}.clicked` },
        });
      } catch {
        // silently ignore tracking errors to avoid affecting business logic
      }
    },
    [analytics],
  );

  const handleOpenChangelogModal = useCallback(() => {
    openChangelogModal();
  }, []);

  const handleOpenFeedbackModal = useCallback(() => {
    openFeedbackModal();
  }, []);

  const { helpMenuItems, trackedMenuKeys } = useMemo<{
    helpMenuItems: SidebarMenuItems;
    trackedMenuKeys: string[];
  }>(() => {
    const billboardItems =
      typeof billboardMenuItems === 'function' ? billboardMenuItems() : billboardMenuItems;

    const ownItems: FooterMenuItems = [
      ...(footer.showSettingsEntry && !isDevMode
        ? [
            {
              icon: <Settings2 size={14} />,
              key: 'setting',
              label: <WorkspaceLink to="/settings">{t(settingLabelKey)}</WorkspaceLink>,
            },
            {
              type: 'divider' as const,
            },
          ]
        : []),
      {
        icon: <Book size={14} />,
        key: 'docs',
        label: (
          <a href={DOCUMENTS_REFER_URL} rel="noopener noreferrer" target="_blank">
            {t('userPanel.docs')}
          </a>
        ),
      },
      {
        icon: <Feather size={14} />,
        key: 'feedback',
        label: t('userPanel.feedback'),
        onClick: handleOpenFeedbackModal,
      },
      // A deployment without a community server has no Discord entry to offer;
      // it is dropped instead of rendering a menu row that goes nowhere. The
      // divider below stays — it separates the help links above (docs,
      // feedback) from the app entries below (changelog, get app), so it is not
      // this row's tail and never becomes a doubled separator.
      ...(SOCIAL_URL.discord
        ? [
            {
              icon: <DiscordIcon size={14} />,
              key: 'discord',
              label: (
                <a href={SOCIAL_URL.discord} rel="noopener noreferrer" target="_blank">
                  {t('userPanel.discord')}
                </a>
              ),
            },
          ]
        : []),
      {
        type: 'divider',
      },
      {
        icon: <FileClockIcon size={14} />,
        key: 'changelog',
        label: t('changelog'),
        onClick: handleOpenChangelogModal,
      },
      ...(footer.layout === 'compact'
        ? [
            {
              icon: <Download size={14} />,
              key: 'get-app',
              label: <WorkspaceLink to="/settings/about">{t('getApp')}</WorkspaceLink>,
            },
          ]
        : []),
      ...(footer.layout === 'compact' && !footer.hideGitHub
        ? [
            {
              icon: <GithubIcon size={14} />,
              key: 'github',
              label: (
                <a href={GITHUB} rel="noopener noreferrer" target="_blank">
                  GitHub
                </a>
              ),
            },
          ]
        : []),
    ];

    return {
      helpMenuItems: [
        ...injectMenuTracking(ownItems, trackMenuClick),
        ...(isHomeSidebar && billboardItems !== undefined && billboardItems.length > 0
          ? [{ type: 'divider' as const }, ...billboardItems]
          : []),
      ],
      trackedMenuKeys: collectMenuKeys(ownItems),
    };
  }, [
    trackMenuClick,
    footer.showSettingsEntry,
    footer.layout,
    footer.hideGitHub,
    handleOpenChangelogModal,
    handleOpenFeedbackModal,
    isDevMode,
    t,
    settingLabelKey,
    billboardMenuItems,
    isHomeSidebar,
  ]);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      try {
        analytics?.track({
          name: 'home_footer_menu_opened',
          properties: { keys: trackedMenuKeys.join(','), spm: 'homepage.footer.opened' },
        });
      } catch {
        // silently ignore tracking errors to avoid affecting business logic
      }
    },
    [analytics, trackedMenuKeys],
  );

  return (
    <>
      {footer.layout === 'expanded' ? (
        <div className="flex items-center gap-0.5 justify-between p-2">
          <div className="flex items-center flex-1 gap-0.5">
            <SidebarDropdownMenu
              items={helpMenuItems}
              placement="topLeft"
              onOpenChange={handleMenuOpenChange}
            >
              <ActionIcon
                aria-label={t('userPanel.help')}
                data-billboard-anchor=""
                icon={CircleHelp}
                size={16}
              />
            </SidebarDropdownMenu>
            {!footer.hideGitHub && (
              <a aria-label={'GitHub'} href={GITHUB} rel="noopener noreferrer" target={'_blank'}>
                <ActionIcon icon={GithubIcon} size={16} title={'GitHub'} />
              </a>
            )}
            <UserPanel>
              <div className="flex flex-col items-center justify-center p-1 cursor-pointer">
                <UserAvatar size={20} />
              </div>
            </UserPanel>
          </div>
          <ThemeButton placement={'top'} size={16} />
        </div>
      ) : (
        // Linear's bottom bar: `?` help anchors the left; the right cluster is
        // the agent-panel switch followed by the avatar. The toggle rides the
        // global `showRightPanel` state — the panel itself materializes on the
        // surfaces that host it (agent conversation, task detail, …).
        <div className="flex items-center justify-between p-2">
          <SidebarDropdownMenu
            items={helpMenuItems}
            placement="topLeft"
            onOpenChange={handleMenuOpenChange}
          >
            <ActionIcon aria-label={t('userPanel.help')} icon={CircleHelp} size={16} />
          </SidebarDropdownMenu>
          <div className="flex items-center gap-0.5">
            {isHomeSidebar && <ToggleRightPanelButton id={null} size={16} />}
            {isDevMode && (
              <WorkspaceLink to="/settings">
                <ActionIcon
                  aria-label={t(settingLabelKey)}
                  icon={SettingsIcon}
                  size={16}
                  title={t(settingLabelKey)}
                />
              </WorkspaceLink>
            )}
            <UserPanel>
              <div className="flex flex-col items-center justify-center p-1 cursor-pointer">
                <UserAvatar size={20} />
              </div>
            </UserPanel>
          </div>
        </div>
      )}
      {isHomeSidebar && <Billboard />}
    </>
  );
});

export default Footer;
