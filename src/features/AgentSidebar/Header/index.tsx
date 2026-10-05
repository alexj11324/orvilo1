'use client';

import { HomeIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import NavItem from '@/features/NavPanel/components/NavItem';
import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';

import Nav from './Nav';

/**
 * The topic sidebar's header row: one **Home** destination, styled exactly like
 * the rows beneath it.
 *
 * It used to be a back chevron followed by the agent's display name, which read
 * as a breadcrumb — "you are partway along a path". That is the wrong shape for
 * this sidebar: everything under it is a flat list of destinations, so the first
 * entry should be the way out rather than a trail of where you came from.
 *
 * `showBack` is off for the same reason — it would draw a second chevron beside
 * this row and restore the breadcrumb look. **Home is the only way out of the
 * agent view**, so it must not be dropped without providing another.
 *
 * Do NOT put the workspace identity in this slot either: the shell already shows
 * the workspace — and its switcher — in the row directly above, so a workspace
 * name here renders the same thing twice in adjacent rows.
 */
const HeaderInfo = memo(() => {
  const { t } = useTranslation('chat');
  const activeSlug = useActiveWorkspaceSlug();
  const homeHref = buildWorkspaceAwarePath('/', activeSlug);

  return (
    <>
      <SideBarHeaderLayout
        showBack={false}
        left={
          <NavItem
            href={homeHref}
            icon={HomeIcon}
            iconSize={DESKTOP_HEADER_ICON_SMALL_SIZE.size}
            title={t('tab.home')}
            onClick={() => {
              // NavItem already suppresses the plain-click default when `href` is
              // set, so this stays in-app; a modifier click is left alone and
              // opens a real new tab through that href.
              appNavigate(homeHref, { escape: true });
            }}
          />
        }
      />
      <Nav />
    </>
  );
});

export default HeaderInfo;
