import { Megaphone } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SidebarDropdownMenuProps } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useGlobalStore } from '@/store/global';
import { useServerConfigStore } from '@/store/serverConfig';

import { billboardDismissKey } from './index';
import { resolveBillboardTitle } from './locale';

export const useBillboardMenuItems = (): SidebarDropdownMenuProps['items'] => {
  const billboard = useServerConfigStore((s) => s.billboard);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const { i18n } = useTranslation();

  return useMemo(() => {
    if (!billboard || billboard.items.length === 0) return [];
    const now = Date.now();
    const start = Date.parse(billboard.startAt);
    const end = Date.parse(billboard.endAt);
    const inWindow = Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end;
    if (!inWindow) return [];
    const title = resolveBillboardTitle(billboard, i18n.language);
    return [
      {
        icon: <Megaphone />,
        key: `billboard-${billboard.slug}`,
        label: (
          <span
            title={title}
            style={{
              display: 'inline-block',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              verticalAlign: 'middle',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
        ),
        onClick: () => {
          const slug = billboardDismissKey(billboard.slug);
          const current = useGlobalStore.getState().status.readNotificationSlugs ?? [];
          if (current.includes(slug)) {
            updateSystemStatus({
              readNotificationSlugs: current.filter((s) => s !== slug),
            });
          }
        },
      },
    ];
  }, [billboard, i18n.language, updateSystemStatus]);
};
