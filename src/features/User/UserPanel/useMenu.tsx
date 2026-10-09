import { ORVILO_CLOUD, UTM_SOURCE } from '@orvilo/business-const';
import { isDesktop } from '@orvilo/const';
import { cn } from 'cn';
import { Cloudy, Download, HardDriveDownload, LogOut, Settings2 } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import useBusinessMenuItems from '@/business/client/features/User/useBusinessMenuItems';
import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import type { ItemType, MenuProps } from '@/components/Menu';
import { Badge } from '@/components/reui/badge';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { DEFAULT_DESKTOP_HOTKEY_CONFIG } from '@/const/desktop';
import { OFFICIAL_URL } from '@/const/url';
import DataImporter from '@/features/DataImporter';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useNavLayout } from '@/hooks/useNavLayout';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { hotkeyDisplayKeys } from '@/utils/hotkeyDisplay';
import { isMacOS } from '@/utils/platform';

import { useNewVersion } from './useNewVersion';

const NewVersionBadge = memo(
  ({
    children,
    showBadge,
    onClick,
  }: PropsWithChildren & { onClick?: () => void; showBadge?: boolean }) => {
    const { t } = useTranslation('common');
    if (!showBadge)
      return (
        <div
          {...clickableProps()}
          className={cn('flex flex-col flex-1', CLICKABLE_FOCUS_RING)}
          onClick={onClick}
        >
          {children}
        </div>
      );
    return (
      <div
        {...clickableProps()}
        className={cn('flex items-center flex-1 gap-2 w-full', CLICKABLE_FOCUS_RING)}
        onClick={onClick}
      >
        {children}
        <Badge size="sm" style={{ borderRadius: 16, paddingInline: 8 }} variant="info">
          {t('upgradeVersion.hasNew')}
        </Badge>
      </div>
    );
  },
);

export const useMenu = () => {
  const hasNewVersion = useNewVersion();
  const { t } = useTranslation(['common', 'setting', 'auth']);
  const { showCloudPromotion, hideDocs } = useServerConfigStore(featureFlagsSelectors);
  const [isLogin, isLoginWithAuth] = useUserStore((s) => [
    authSelectors.isLogin(s),
    authSelectors.isLoginWithAuth(s),
  ]);
  const { userPanel } = useNavLayout();
  const businessMenuItems = useBusinessMenuItems(isLogin);
  const hasActiveWorkspace = useHasActiveWorkspace();

  const settings: MenuProps['items'] = [
    {
      extra: isDesktop ? (
        <KbdGroup>
          {hotkeyDisplayKeys(DEFAULT_DESKTOP_HOTKEY_CONFIG.openSettings, isMacOS()).map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      ) : undefined,
      icon: <Settings2 />,
      key: 'setting',
      label: (
        <WorkspaceLink to="/settings">
          <NewVersionBadge showBadge={hasNewVersion}>
            {t(hasActiveWorkspace ? 'userPanel.workspaceSetting' : 'userPanel.setting')}
          </NewVersionBadge>
        </WorkspaceLink>
      ),
    },
  ];

  const helps: MenuProps['items'] = [
    showCloudPromotion && {
      icon: <Cloudy />,
      key: 'cloud',
      label: (
        <a
          href={`${OFFICIAL_URL}?utm_source=${UTM_SOURCE}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t('userPanel.cloud', { name: ORVILO_CLOUD })}
        </a>
      ),
    },
  ].filter(Boolean) as ItemType[];

  const getApp: MenuProps['items'] = [
    {
      icon: <Download />,
      key: 'get-app',
      label: <WorkspaceLink to="/settings/about">{t('getApp')}</WorkspaceLink>,
    },
  ];

  const mainItems = [
    {
      type: 'divider',
    },

    ...(isLogin ? settings : []),
    ...businessMenuItems,
    ...(userPanel.showDataImporter && isLogin
      ? [
          {
            icon: <HardDriveDownload />,
            key: 'import',
            label: <DataImporter>{t('importData')}</DataImporter>,
          },
          {
            type: 'divider' as const,
          },
        ]
      : []),
    ...(!hideDocs ? helps : []),
    ...getApp,
  ]
    .filter(Boolean)
    // Remove consecutive dividers to prevent double divider lines
    .filter((item, index, arr) => {
      if (index === 0) return true;
      const isDivider = (i: any) => i && typeof i === 'object' && i.type === 'divider';
      return !(isDivider(item) && isDivider(arr[index - 1]));
    }) as MenuProps['items'];

  const logoutItems: MenuProps['items'] = isLoginWithAuth
    ? [
        {
          icon: <LogOut />,
          key: 'logout',
          label: <span>{t('signout', { ns: 'auth' })}</span>,
        },
        {
          type: 'divider',
        },
      ]
    : [];

  return { logoutItems, mainItems };
};
