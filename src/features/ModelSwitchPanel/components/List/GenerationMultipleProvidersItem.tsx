'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import type { ComponentType } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderItemRender } from '@/components/ModelSelect';
import { DropdownMenuSub } from '@/components/ui/dropdown-menu';
import type { PricingMode } from '@/features/ModelSwitchPanel/components/ModelDetailPanel';
import ModelDetailPanel from '@/features/ModelSwitchPanel/components/ModelDetailPanel';
import { menuItemClassName, MenuPanelPopup } from '@/features/ModelSwitchPanel/menu';
import { styles as modelSwitchPanelStyles } from '@/features/ModelSwitchPanel/styles';
import type { ListItem } from '@/features/ModelSwitchPanel/types';
import { menuKey } from '@/features/ModelSwitchPanel/utils';
import type { EnabledProviderWithModels } from '@/types/index';

interface GenerationMultipleProvidersItemProps {
  activeKey: string;
  enabledList: EnabledProviderWithModels[];
  item: Extract<ListItem, { type: 'model-item-multiple' }>;
  ModelItemComponent: ComponentType<any>;
  onClose: () => void;
  onModelChange: (modelId: string, providerId: string) => void;
  pricingMode?: PricingMode;
}

const GenerationMultipleProvidersItem = memo<GenerationMultipleProvidersItemProps>(
  ({ item, activeKey, onClose, onModelChange, enabledList, ModelItemComponent, pricingMode }) => {
    const { t } = useTranslation('components');
    const [subOpen, setSubOpen] = useState(false);
    const activeProvider = item.data.providers.find(
      (p) => menuKey(p.id, item.data.model.id) === activeKey,
    );
    const isActive = !!activeProvider;

    return (
      <div className="flex flex-col my-px mx-1">
        <DropdownMenuSub open={subOpen} onOpenChange={setSubOpen}>
          <MenuPrimitive.SubmenuTrigger
            className={cn(
              menuItemClassName,
              modelSwitchPanelStyles.menuRow,
              isActive && modelSwitchPanelStyles.menuItemActive,
            )}
            onClick={() => {
              setSubOpen(false);
              onModelChange(item.data.model.id, (activeProvider ?? item.data.providers[0]).id);
              onClose();
            }}
          >
            <ModelItemComponent
              {...item.data.model}
              providerId={(activeProvider ?? item.data.providers[0]).id}
              showPopover={false}
            />
          </MenuPrimitive.SubmenuTrigger>
          <MenuPanelPopup
            className={cn(modelSwitchPanelStyles.detailPopup, modelSwitchPanelStyles.dropdownMenu)}
            placement="right"
            sideOffset={12}
          >
            <ModelDetailPanel
              enabledList={enabledList}
              model={item.data.model.id}
              pricingMode={pricingMode}
              provider={(activeProvider ?? item.data.providers[0]).id}
            />
            <div className="flex flex-col gap-1 py-2 px-2">
              <div className={cn('flex flex-col', modelSwitchPanelStyles.caption)}>
                {t('ModelSwitchPanel.useModelFrom')}
              </div>
              {item.data.providers.map((p) => {
                const pKey = menuKey(p.id, item.data.model.id);
                const isProviderActive = isActive ? activeKey === pKey : p.id === 'orvilo';
                return (
                  <div
                    className={cn('flex', modelSwitchPanelStyles.menuItem)}
                    key={pKey}
                    onClick={() => {
                      onModelChange(item.data.model.id, p.id);
                      onClose();
                    }}
                  >
                    <ProviderItemRender
                      logo={p.logo}
                      name={p.name}
                      provider={p.id}
                      source={p.source}
                    />
                    {isProviderActive ? <Check size={16} /> : null}
                  </div>
                );
              })}
            </div>
          </MenuPanelPopup>
        </DropdownMenuSub>
      </div>
    );
  },
);

GenerationMultipleProvidersItem.displayName = 'GenerationMultipleProvidersItem';

export default GenerationMultipleProvidersItem;
