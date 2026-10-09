'use client';

import { LogOutIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isImageAvatar } from '@/features/ReUIShell/WorkspaceAvatar';
import { useSignOut } from '@/hooks/useSignOut';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { resolveAccountLabel } from './accountLabel';

/**
 * Who is signing in, and the way out when it is the wrong account. Shown in the
 * onboarding header on every step so a user on the wrong email is never stuck.
 */
const AccountMenu = () => {
  const { t } = useTranslation(['onboarding', 'auth']);
  const signOut = useSignOut();
  const avatar = useUserAvatar();
  const fullName = useUserStore(userProfileSelectors.fullName);
  const email = useUserStore(userProfileSelectors.email);
  const label = resolveAccountLabel({ email, fullName });
  if (!label) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t('onboarding:setup.accountMenu', { name: label })}
            className="max-w-48 gap-2"
            variant="ghost"
          />
        }
      >
        <Avatar className="size-5">
          {isImageAvatar(avatar) && <AvatarImage alt="" src={avatar} />}
          <AvatarFallback className="text-[10px]">{label.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="hidden truncate sm:inline">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          {email && (
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOutIcon aria-hidden />
            {t('onboarding:setup.wrongEmail')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AccountMenu;
