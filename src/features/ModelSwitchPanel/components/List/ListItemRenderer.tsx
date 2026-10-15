import { Menu } from '@base-ui/react/menu';
import { cn } from 'cn';
import { LucideArrowRight, LucideBolt } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import { ModelItemRender, ProviderItemRender } from '@/components/ModelSelect';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { getFloatingCollisionPadding } from '@/libs/contextMenu/collisionPadding';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { styles } from '../../styles';
import { type ListItem } from '../../types';
import { menuKey } from '../../utils';
import ModelDetailPanel from '../ModelDetailPanel';
import { MultipleProvidersModelItem } from './MultipleProvidersModelItem';
import { SingleProviderModelItem } from './SingleProviderModelItem';

interface ListItemRendererProps {
  activeKey: string;
  isModelRestricted?: (modelId: string, providerId: string) => boolean;
  item: ListItem;
  newLabel: string;
  onBeforeModelSelect?: (modelId: string, providerId: string) => boolean | Promise<boolean>;
  onClose: () => void;
  onModelChange: (modelId: string, providerId: string) => void;
  onRestrictedModelClick?: () => void;
  proLabel?: string;
  subscribeScroll?: (cb: () => void) => () => void;
}

export const ListItemRenderer = memo<ListItemRendererProps>(
  ({
    activeKey,
    isModelRestricted,
    item,
    newLabel,
    onBeforeModelSelect,
    onModelChange,
    onClose,
    onRestrictedModelClick,
    proLabel,
    subscribeScroll,
  }) => {
    const { t } = useTranslation('components');
    const navigate = useWorkspaceAwareNavigate();
    const activeSlug = useActiveWorkspaceSlug();
    const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
    const [detailOpen, setDetailOpen] = useState(false);

    const selectModel = async (modelId: string, providerId: string) => {
      onClose();
      if ((await onBeforeModelSelect?.(modelId, providerId)) === false) return;

      onModelChange(modelId, providerId);
    };

    useEffect(() => {
      return subscribeScroll?.(() => setDetailOpen(false));
    }, [subscribeScroll]);

    switch (item.type) {
      case 'no-provider': {
        return (
          <Menu.Item
            className={cn('flex min-w-0 flex-row gap-2', styles.menuItem, styles.tertiaryText)}
            key="no-provider"
            onClick={() => {
              onClose();
              navigate('/settings/provider/all');
            }}
          >
            {t('ModelSwitchPanel.emptyProvider')}
            <LucideArrowRight aria-hidden className="size-4 shrink-0" />
          </Menu.Item>
        );
      }

      case 'group-header': {
        return (
          <div
            className={cn('flex flex-row justify-between pt-3 pb-1 ps-3 pe-2', styles.groupHeader)}
            key={`header-${item.provider.id}`}
          >
            <ProviderItemRender
              logo={item.provider.logo}
              name={item.provider.name}
              provider={item.provider.id}
              source={item.provider.source}
            />
            <ActionIcon
              className={cn('settings-icon', styles.settingsAction)}
              icon={LucideBolt}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('ModelSwitchPanel.goToSettings')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = urlJoin('/settings/provider', item.provider.id || 'all');
                if (e.ctrlKey || e.metaKey) {
                  window.open(buildWorkspaceAwarePath(url, activeSlug), '_blank');
                } else {
                  navigate(url);
                }
                onClose();
              }}
            />
          </div>
        );
      }

      case 'empty-model': {
        return (
          <Menu.Item
            className={cn('flex min-w-0 flex-row gap-2', styles.menuItem, styles.tertiaryText)}
            key={`empty-${item.provider.id}`}
            onClick={() => {
              onClose();
              navigate(`/settings/provider/${item.provider.id}`);
            }}
          >
            {t('ModelSwitchPanel.emptyModel')}
            <LucideArrowRight aria-hidden className="size-4 shrink-0" />
          </Menu.Item>
        );
      }

      case 'provider-model-item': {
        const key = menuKey(item.provider.id, item.model.id);
        const isActive = key === activeKey;
        const restricted = isModelRestricted?.(item.model.id, item.provider.id);

        return (
          <div className="flex min-w-0 flex-col my-px mx-1">
            <Menu.SubmenuRoot open={detailOpen} onOpenChange={setDetailOpen}>
              <Menu.SubmenuTrigger
                className={cn(
                  'relative flex w-full min-h-9 min-w-0 select-none items-center overflow-hidden rounded-(--radius-button) px-3 py-1.5 text-sm text-foreground outline-none hover:bg-accent focus:bg-accent active:bg-selected',
                  styles.menuRow,
                  isActive && styles.menuItemActive,
                )}
                onClick={(e) => {
                  e.preventDefault();
                  setDetailOpen(false);
                  if (restricted) {
                    onRestrictedModelClick?.();
                    onClose();
                    return;
                  }
                  void selectModel(item.model.id, item.provider.id);
                }}
              >
                <ModelItemRender
                  {...item.model}
                  {...item.model.abilities}
                  newBadgeLabel={newLabel}
                  proBadgeLabel={restricted ? proLabel : undefined}
                  showInfoTag={isDevMode}
                />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner
                  align="center"
                  anchor={null}
                  className={POPUP_Z_CLASS}
                  collisionPadding={getFloatingCollisionPadding()}
                  side="right"
                  sideOffset={12}
                >
                  <Menu.Popup
                    className={cn(
                      POPUP_Z_CLASS,
                      'rounded-(--radius-overlay) bg-popover text-popover-foreground shadow-(--shadow-popover) outline-none',
                      styles.detailPopup,
                    )}
                  >
                    <ModelDetailPanel model={item.model.id} provider={item.provider.id} />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
          </div>
        );
      }

      case 'model-item-single': {
        const singleProvider = item.data.providers[0];
        const key = menuKey(singleProvider.id, item.data.model.id);
        const isActive = key === activeKey;
        const restricted = isModelRestricted?.(item.data.model.id, singleProvider.id);

        return (
          <div className="flex min-w-0 flex-col my-px mx-1">
            <Menu.SubmenuRoot open={detailOpen} onOpenChange={setDetailOpen}>
              <Menu.SubmenuTrigger
                className={cn(
                  'relative flex w-full min-h-9 min-w-0 select-none items-center overflow-hidden rounded-(--radius-button) px-3 py-1.5 text-sm text-foreground outline-none hover:bg-accent focus:bg-accent active:bg-selected',
                  styles.menuRow,
                  isActive && styles.menuItemActive,
                )}
                onClick={(e) => {
                  e.preventDefault();
                  setDetailOpen(false);
                  if (restricted) {
                    onRestrictedModelClick?.();
                    onClose();
                    return;
                  }
                  void selectModel(item.data.model.id, singleProvider.id);
                }}
              >
                <SingleProviderModelItem
                  data={item.data}
                  newLabel={newLabel}
                  proBadgeLabel={restricted ? proLabel : undefined}
                  showInfoTag={isDevMode}
                />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner
                  align="center"
                  anchor={null}
                  className={POPUP_Z_CLASS}
                  collisionPadding={getFloatingCollisionPadding()}
                  side="right"
                  sideOffset={16}
                >
                  <Menu.Popup
                    className={cn(
                      POPUP_Z_CLASS,
                      'rounded-(--radius-overlay) bg-popover text-popover-foreground shadow-(--shadow-popover) outline-none',
                      styles.detailPopup,
                    )}
                  >
                    <ModelDetailPanel model={item.data.model.id} provider={singleProvider.id} />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
          </div>
        );
      }

      case 'model-item-multiple': {
        return (
          <div className="flex min-w-0 flex-col my-px mx-1" key={item.data.displayName}>
            <MultipleProvidersModelItem
              activeKey={activeKey}
              data={item.data}
              isModelRestricted={isModelRestricted}
              newLabel={newLabel}
              proLabel={proLabel}
              showInfoTag={isDevMode}
              onBeforeModelSelect={onBeforeModelSelect}
              onClose={onClose}
              onModelChange={onModelChange}
              onRestrictedModelClick={onRestrictedModelClick}
            />
          </div>
        );
      }

      default: {
        return null;
      }
    }
  },
);

ListItemRenderer.displayName = 'ListItemRenderer';
