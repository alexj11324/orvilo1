'use client';

import {
  DropdownMenuPopup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuSubmenuRoot,
  DropdownMenuSubmenuTrigger,
  menuSharedStyles,
} from '@lobehub/ui';
import { cn } from 'cn';
import { LucideArrowRight, LucideBolt } from 'lucide-react';
import type { ComponentType } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import { ProviderItemRender } from '@/components/ModelSelect';
import type { PricingMode } from '@/features/ModelSwitchPanel/components/ModelDetailPanel';
import ModelDetailPanel from '@/features/ModelSwitchPanel/components/ModelDetailPanel';
import { styles as modelSwitchPanelStyles } from '@/features/ModelSwitchPanel/styles';
import type { ListItem } from '@/features/ModelSwitchPanel/types';
import { menuKey } from '@/features/ModelSwitchPanel/utils';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import type { EnabledProviderWithModels } from '@/types/index';

import GenerationMultipleProvidersItem from './GenerationMultipleProvidersItem';

export interface GenerationListItemRendererProps {
  activeKey: string;
  enabledList: EnabledProviderWithModels[];
  item: ListItem;
  ModelItemComponent: ComponentType<any>;
  onClose: () => void;
  onModelChange: (modelId: string, providerId: string) => void;
  pricingMode?: PricingMode;
}

const GenerationListItemRenderer = memo<GenerationListItemRendererProps>(
  ({ item, activeKey, onClose, onModelChange, enabledList, ModelItemComponent, pricingMode }) => {
    const { t } = useTranslation('components');
    const navigate = useWorkspaceAwareNavigate();
    const activeSlug = useActiveWorkspaceSlug();
    const [detailOpen, setDetailOpen] = useState(false);

    switch (item.type) {
      case 'no-provider': {
        return (
          <div
            className={cn(
              'flex gap-2',
              modelSwitchPanelStyles.menuItem,
              modelSwitchPanelStyles.tertiaryText,
            )}
            onClick={() => {
              onClose();
              navigate('/settings/provider/all');
            }}
          >
            {t('ModelSwitchPanel.emptyProvider')}
            <LucideArrowRight size={16} />
          </div>
        );
      }

      case 'group-header': {
        return (
          <div
            className={cn(
              'flex justify-between pt-3 pb-1 ps-3 pe-2 w-full',
              modelSwitchPanelStyles.groupHeader,
            )}
          >
            <ProviderItemRender
              logo={item.provider.logo}
              name={item.provider.name}
              provider={item.provider.id}
              source={item.provider.source}
            />
            <ActionIcon
              className={cn('settings-icon', modelSwitchPanelStyles.settingsAction)}
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
          <div
            className={cn(
              'flex gap-2',
              modelSwitchPanelStyles.menuItem,
              modelSwitchPanelStyles.tertiaryText,
            )}
            onClick={() => {
              navigate(`/settings/provider/${item.provider.id}`);
              onClose();
            }}
          >
            {t('ModelSwitchPanel.emptyModel')}
            <LucideArrowRight size={16} />
          </div>
        );
      }

      case 'provider-model-item': {
        const key = menuKey(item.provider.id, item.model.id);
        const isActive = key === activeKey;
        return (
          <div className="flex flex-col my-px mx-1">
            <DropdownMenuSubmenuRoot open={detailOpen} onOpenChange={setDetailOpen}>
              <DropdownMenuSubmenuTrigger
                className={cn(
                  menuSharedStyles.item,
                  modelSwitchPanelStyles.menuRow,
                  isActive && modelSwitchPanelStyles.menuItemActive,
                )}
                onClick={() => {
                  setDetailOpen(false);
                  onModelChange(item.model.id, item.provider.id);
                  onClose();
                }}
              >
                <ModelItemComponent
                  {...item.model}
                  providerId={item.provider.id}
                  showPopover={false}
                />
              </DropdownMenuSubmenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuPositioner anchor={null} placement="right" sideOffset={12}>
                  <DropdownMenuPopup className={modelSwitchPanelStyles.detailPopup}>
                    <ModelDetailPanel
                      enabledList={enabledList}
                      model={item.model.id}
                      pricingMode={pricingMode}
                      provider={item.provider.id}
                    />
                  </DropdownMenuPopup>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenuSubmenuRoot>
          </div>
        );
      }

      case 'model-item-single': {
        const singleProvider = item.data.providers[0];
        const key = menuKey(singleProvider.id, item.data.model.id);
        const isActive = key === activeKey;
        return (
          <div className="flex flex-col my-px mx-1">
            <DropdownMenuSubmenuRoot open={detailOpen} onOpenChange={setDetailOpen}>
              <DropdownMenuSubmenuTrigger
                className={cn(
                  menuSharedStyles.item,
                  modelSwitchPanelStyles.menuRow,
                  isActive && modelSwitchPanelStyles.menuItemActive,
                )}
                onClick={() => {
                  setDetailOpen(false);
                  onModelChange(item.data.model.id, singleProvider.id);
                  onClose();
                }}
              >
                <ModelItemComponent
                  {...item.data.model}
                  providerId={singleProvider.id}
                  showPopover={false}
                />
              </DropdownMenuSubmenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuPositioner anchor={null} placement="right" sideOffset={12}>
                  <DropdownMenuPopup className={modelSwitchPanelStyles.detailPopup}>
                    <ModelDetailPanel
                      enabledList={enabledList}
                      model={item.data.model.id}
                      pricingMode={pricingMode}
                      provider={singleProvider.id}
                    />
                  </DropdownMenuPopup>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenuSubmenuRoot>
          </div>
        );
      }

      case 'model-item-multiple': {
        return (
          <GenerationMultipleProvidersItem
            ModelItemComponent={ModelItemComponent}
            activeKey={activeKey}
            enabledList={enabledList}
            item={item}
            pricingMode={pricingMode}
            onClose={onClose}
            onModelChange={onModelChange}
          />
        );
      }

      default: {
        return null;
      }
    }
  },
);

GenerationListItemRenderer.displayName = 'GenerationListItemRenderer';

export default GenerationListItemRenderer;
