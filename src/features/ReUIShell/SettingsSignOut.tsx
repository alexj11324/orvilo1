'use client';

import { LogInIcon, LogOutIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useSignOut } from '@/hooks/useSignOut';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

/**
 * Settings surfaces carry no workspace-switcher header, so the account menu's
 * sign-out would be unreachable there. This single row is the only footer content.
 */
export function SettingsSignOut() {
  const { t } = useTranslation('auth');
  const signOut = useSignOut();
  const [isSignedIn, openLogin] = useUserStore((state) => [
    authSelectors.isLoginWithAuth(state),
    state.openLogin,
  ]);
  const label = isSignedIn ? t('signout') : t('login');

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={label}
          onClick={() => (isSignedIn ? void signOut() : openLogin())}
        >
          {isSignedIn ? <LogOutIcon aria-hidden /> : <LogInIcon aria-hidden />}
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
