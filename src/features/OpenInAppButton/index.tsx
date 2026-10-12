import { isDesktop } from '@orvilo/const';
import type { OpenInAppId } from '@orvilo/electron-client-ipc';
import { ChevronDownIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';

import { APP_ICONS } from './apps';
import { useOpenInApp } from './useOpenInApp';

interface AppIconProps {
  icon?: string;
  id: OpenInAppId;
  size?: number;
}

const AppIcon = ({ id, icon, size = 16 }: AppIconProps) => {
  if (icon) {
    return <img alt="" className="block object-contain" height={size} src={icon} width={size} />;
  }
  const Fallback = APP_ICONS[id];
  return <Fallback size={size} />;
};

const styles = {
  dropdownItem: 'flex items-center gap-2',
  leftButton:
    'cursor-pointer rounded-e-none border-divider border-e-0 px-2 text-muted-foreground transition-[color,background-color] duration-(--orvilo-motion-mid) hover:bg-accent hover:text-foreground',
  rightButton:
    'cursor-pointer rounded-s-none border-divider px-1 text-muted-foreground transition-[color,background-color] duration-(--orvilo-motion-mid) hover:bg-accent hover:text-foreground',
  root: 'inline-flex items-stretch',
};

export interface OpenInAppButtonProps {
  className?: string;
  workingDirectory: string;
}

const OpenInAppButton = memo<OpenInAppButtonProps>(({ workingDirectory, className }) => {
  const { t } = useTranslation('openInApp');
  const { defaultApp, installedApps, launch, ready } = useOpenInApp(workingDirectory);

  const defaultAppEntry = useMemo(
    () => installedApps.find((app) => app.id === defaultApp),
    [installedApps, defaultApp],
  );

  const defaultDisplayName = defaultAppEntry?.displayName ?? defaultApp;
  const defaultIconSrc = defaultAppEntry?.icon;

  const dropdownItems = useMemo<SidebarDropdownMenuProps['items']>(
    () =>
      installedApps.map((app) => ({
        icon: <AppIcon icon={app.icon} id={app.id} size={16} />,
        key: app.id,
        label: app.displayName,
        onClick: () => {
          void launch(app.id);
        },
      })),
    [installedApps, launch],
  );

  if (!isDesktop || !workingDirectory) return null;
  if (!ready) return null;

  const wrapperClassName = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <Button
                  aria-label={t('tooltip', { appName: defaultDisplayName })}
                  className={styles.leftButton}
                  size="compact"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void launch(defaultApp);
                  }}
                >
                  <AppIcon icon={defaultIconSrc} id={defaultApp} size={16} />
                </Button>
              </span>
            }
          />
          <TooltipContent>{t('tooltip', { appName: defaultDisplayName })}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SidebarDropdownMenu items={dropdownItems}>
        <Button
          aria-label={t('dropdownLabel')}
          className={styles.rightButton}
          size="compact"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon size={16} />
        </Button>
      </SidebarDropdownMenu>
    </div>
  );
});

OpenInAppButton.displayName = 'OpenInAppButton';

export default OpenInAppButton;
