import { stopPropagation } from '@lobehub/ui';
import { isValidElement, memo, type ReactElement, useCallback, useState } from 'react';

import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { PanelContent } from './components/PanelContent';
import { MenuPanelPopup } from './menu';
import { styles } from './styles';
import { type ModelSwitchPanelProps } from './types';

const ModelSwitchPanel = memo<ModelSwitchPanelProps>(
  ({
    ModelItemComponent,
    children,
    enabledList,
    model: modelProp,
    onModelChange,
    onOpenChange,
    open,
    placement = 'topLeft',
    pricingMode,
    provider: providerProp,
    simpleSource,
    openOnHover = true,
  }) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = open ?? internalOpen;

    const handleOpenChange = useCallback(
      (nextOpen: boolean) => {
        setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
      },
      [onOpenChange],
    );

    return (
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        {/* The trigger renders as the caller's element, like the former cloned trigger. */}
        <DropdownMenuTrigger
          className={styles.trigger}
          nativeButton={isValidElement(children) && children.type === 'button'}
          openOnHover={openOnHover}
          render={isValidElement(children) ? (children as ReactElement) : <span />}
        >
          {isValidElement(children) ? undefined : children}
        </DropdownMenuTrigger>
        <MenuPanelPopup
          className={styles.container}
          placement={placement}
          onKeyDown={stopPropagation}
        >
          <PanelContent
            ModelItemComponent={ModelItemComponent}
            enabledList={enabledList}
            model={modelProp}
            pricingMode={pricingMode}
            provider={providerProp}
            simpleSource={simpleSource}
            onModelChange={onModelChange}
            onOpenChange={handleOpenChange}
          />
        </MenuPanelPopup>
      </DropdownMenu>
    );
  },
);

ModelSwitchPanel.displayName = 'ModelSwitchPanel';

export default ModelSwitchPanel;

export { ModelSwitchSubmenuPopup } from './SubmenuPopup';
export { type ModelSwitchPanelProps, type SimpleModelSource } from './types';
