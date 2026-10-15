import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Flexbox } from '@lobehub/ui';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelItemRender, ProviderItemRender } from '@/components/ModelSelect';
import { Badge } from '@/components/reui/badge';
import { DropdownMenuGroup, DropdownMenuSub } from '@/components/ui/dropdown-menu';

import { menuGroupLabelClassName, menuItemClassName, MenuPanelPopup } from '../../menu';
import { styles } from '../../styles';
import { type ModelWithProviders } from '../../types';
import { menuKey } from '../../utils';
import ModelDetailPanel from '../ModelDetailPanel';

interface MultipleProvidersModelItemProps {
  activeKey: string;
  data: ModelWithProviders;
  defaultProviderId?: string;
  isModelRestricted?: (modelId: string, providerId: string) => boolean;
  newLabel: string;
  onBeforeModelSelect?: (modelId: string, providerId: string) => boolean | Promise<boolean>;
  onClose: () => void;
  onModelChange: (modelId: string, providerId: string) => void;
  onRestrictedModelClick?: () => void;
  proLabel?: string;
  showInfoTag?: boolean;
}

export const MultipleProvidersModelItem = memo<MultipleProvidersModelItemProps>(
  ({
    activeKey,
    data,
    isModelRestricted,
    newLabel,
    onBeforeModelSelect,
    onModelChange,
    onClose,
    onRestrictedModelClick,
    proLabel,
    showInfoTag,
  }) => {
    const { t } = useTranslation('components');
    const [submenuOpen, setSubmenuOpen] = useState(false);

    const activeProvider = data.providers.find((p) => menuKey(p.id, data.model.id) === activeKey);
    const isActive = !!activeProvider;
    const defaultProvider = data.providers[0];
    const defaultProviderRestricted = Boolean(
      defaultProvider && isModelRestricted?.(data.model.id, defaultProvider.id),
    );

    const allRestricted =
      isModelRestricted &&
      data.providers.length > 0 &&
      data.providers.every((p) => isModelRestricted(data.model.id, p.id));

    const selectModel = async (providerId: string) => {
      setSubmenuOpen(false);
      onClose();
      if ((await onBeforeModelSelect?.(data.model.id, providerId)) === false) return;

      onModelChange(data.model.id, providerId);
    };

    return (
      <DropdownMenuSub
        open={submenuOpen}
        onOpenChange={(open) => {
          if (allRestricted && open) return;
          setSubmenuOpen(open);
        }}
      >
        <MenuPrimitive.SubmenuTrigger
          className={cn(menuItemClassName, styles.menuRow, isActive && styles.menuItemActive)}
          onClick={() => {
            if (defaultProviderRestricted) {
              onRestrictedModelClick?.();
              onClose();
              return;
            }
            if (!defaultProvider) {
              onClose();
              return;
            }
            void selectModel(defaultProvider.id);
          }}
        >
          <ModelItemRender
            {...data.model}
            {...data.model.abilities}
            newBadgeLabel={newLabel}
            proBadgeLabel={defaultProviderRestricted ? proLabel : undefined}
            showInfoTag={showInfoTag}
          />
        </MenuPrimitive.SubmenuTrigger>
        <MenuPanelPopup
          className={cn(styles.detailPopup, styles.dropdownMenu)}
          placement="right"
          sideOffset={12}
        >
          <ModelDetailPanel
            model={data.model.id}
            provider={(activeProvider ?? data.providers[0]).id}
          />
          <DropdownMenuGroup>
            <MenuPrimitive.GroupLabel className={cn(menuGroupLabelClassName, styles.groupCaption)}>
              {t('ModelSwitchPanel.useModelFrom')}
            </MenuPrimitive.GroupLabel>
            {data.providers.map((p) => {
              const key = menuKey(p.id, data.model.id);
              const isProviderActive = isActive ? activeKey === key : p.id === 'orvilo';
              const providerRestricted = isModelRestricted?.(data.model.id, p.id);

              return (
                <MenuPrimitive.Item
                  className={cn(menuItemClassName, styles.menuRow)}
                  key={key}
                  onClick={() => {
                    if (providerRestricted) {
                      onRestrictedModelClick?.();
                      onClose();
                      return;
                    }
                    void selectModel(p.id);
                  }}
                >
                  <span
                    className={cn(
                      'me-3 flex shrink-0 items-center justify-center text-muted-foreground',
                      styles.menuGlyph,
                    )}
                  >
                    {isProviderActive ? <Check size={16} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <Flexbox horizontal align="center" gap={8}>
                      <Flexbox horizontal align="center" className="flex-none">
                        <ProviderItemRender
                          logo={p.logo}
                          name={p.name}
                          provider={p.id}
                          size={20}
                          source={p.source}
                          type={'avatar'}
                        />
                      </Flexbox>
                      {providerRestricted && proLabel && (
                        <Badge size="sm" variant="warning-light">
                          {proLabel}
                        </Badge>
                      )}
                    </Flexbox>
                  </span>
                </MenuPrimitive.Item>
              );
            })}
          </DropdownMenuGroup>
        </MenuPanelPopup>
      </DropdownMenuSub>
    );
  },
);

MultipleProvidersModelItem.displayName = 'MultipleProvidersModelItem';
