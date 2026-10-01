'use client';

import { ChatHeader } from '@lobehub/ui/mobile';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch, useParams, useSearchParams } from 'react-router';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useShowMobileWorkspace } from '@/hooks/useShowMobileWorkspace';
import { SettingsTabs } from '@/store/global/initialState';
import { useSessionStore } from '@/store/session';
import { mobileHeaderSticky } from '@/styles/mobileHeader';

// Explicit tab → i18n key map. Covers:
// - Cross-namespace entries (subscription / auth).
// - Kebab-case SettingsTabs (e.g. 'service-model') whose URL slug doesn't match the camelCase locale key.
//   Without an explicit entry, `setting:tab.${tab}` would resolve to a missing key and render the raw string.
// - Profile: prefer shorter "Profile" (`auth:profile.title`) over "My Account" (`auth:tab.profile`) on mobile.
const TAB_TITLE_KEY: Partial<Record<SettingsTabs, string>> = {
  [SettingsTabs.Billing]: 'subscription:tab.billing',
  [SettingsTabs.Credits]: 'subscription:tab.credits',
  [SettingsTabs.Labs]: 'labs:title',
  [SettingsTabs.Plans]: 'subscription:tab.plans',
  [SettingsTabs.Profile]: 'auth:profile.title',
  [SettingsTabs.Referral]: 'subscription:tab.referral',
  // Legacy deep-links still hit `:tab` briefly before the redirect kicks in —
  // keep the title mapping so the header never flashes a raw key.
  [SettingsTabs.ServiceModel]: 'setting:tab.serviceModel',
  [SettingsTabs.Stats]: 'auth:tab.stats',
  [SettingsTabs.SystemTools]: 'setting:tab.systemTools',
};

const WORKSPACE_TAB_TITLE_KEY: Record<string, string> = {
  budget: 'subscription:tab.budget',
  credential: 'setting:tab.creds',
  general: 'setting:workspaceSetting.tab.general',
  imports: 'setting:workspaceSetting.tab.imports',
  members: 'setting:workspaceSetting.tab.members',
  statistics: 'auth:tab.stats',
};

const Header = memo(() => {
  const { t } = useTranslation(['setting', 'auth', 'labs', 'subscription']);
  const showMobileWorkspace = useShowMobileWorkspace();
  const navigate = useWorkspaceAwareNavigate();
  const params = useParams<{ providerId?: string; tab?: string }>();
  const [searchParams] = useSearchParams();
  const workspaceSettingsMatch = useMatch('/:workspaceSlug/settings/:workspaceTab/*');

  const isSessionActive = useSessionStore((s) => !!s.activeId);
  // Personal provider details carry the id in the path; the workspace provider
  // page canonicalizes it into the `provider` query param instead.
  const queryProvider = searchParams.get('provider');
  const providerId =
    params.providerId ?? (queryProvider && queryProvider !== 'all' ? queryProvider : undefined);
  const isProvider = providerId && providerId !== 'all';

  const handleBackClick = () => {
    if (isSessionActive && showMobileWorkspace) {
      navigate('/agent');
    } else if (params.providerId && params.providerId !== 'all') {
      navigate('/settings/provider/all', { escape: true });
    } else if (isProvider) {
      // Query-selected provider (workspace form): back to the workspace
      // provider list instead of escaping to personal settings.
      navigate('/settings/provider');
    } else {
      navigate('/me/settings', { escape: true });
    }
  };

  const workspaceTab = workspaceSettingsMatch?.params.workspaceTab;
  const tab = (params.tab ?? workspaceTab) as SettingsTabs | undefined;
  const tabTitleKey = tab
    ? (WORKSPACE_TAB_TITLE_KEY[workspaceTab ?? ''] ?? TAB_TITLE_KEY[tab] ?? `setting:tab.${tab}`)
    : 'setting:tab.all';
  // i18next's strict key union rejects dynamic strings. `Parameters<typeof t>[0]` would push TS
  // onto the wrong overload and infer the return as `unknown`, so we fall back to `as any`.
  // Unknown keys surface visibly as raw text, which is acceptable.
  const tabTitle = t(tabTitleKey as any);

  return (
    <ChatHeader
      showBackButton
      style={mobileHeaderSticky}
      center={
        <ChatHeader.Title
          title={
            <div className="flex items-center gap-2">
              <span style={{ lineHeight: 1.2 }}>{isProvider ? providerId : tabTitle}</span>
            </div>
          }
        />
      }
      onBackClick={handleBackClick}
    />
  );
});

export default Header;
