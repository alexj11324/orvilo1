import { Menu } from '@base-ui/react/menu';
import { isValidElement, memo, useCallback, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { getFloatingCollisionPadding } from '@/libs/contextMenu/collisionPadding';

import { PanelContent } from './components/PanelContent';
import { resolveModelMenuPlacement } from './menuPlacement';
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

    const popupPlacement = resolveModelMenuPlacement(placement);

    return (
      <TooltipProvider>
        <Menu.Root modal={false} open={isOpen} onOpenChange={handleOpenChange}>
          <Menu.Trigger
            className={styles.trigger}
            openOnHover={openOnHover}
            render={isValidElement(children) ? children : undefined}
            nativeButton={
              isValidElement(children)
                ? children.type === 'button' ||
                  children.type === Button ||
                  children.type === ActionIcon
                : undefined
            }
          >
            {isValidElement(children) ? undefined : children}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              {...popupPlacement}
              className={POPUP_Z_CLASS}
              collisionPadding={getFloatingCollisionPadding()}
              data-hover-trigger={openOnHover || undefined}
              sideOffset={6}
            >
              <Menu.Popup
                className={`${POPUP_Z_CLASS} rounded-(--radius-overlay) bg-popover text-popover-foreground shadow-(--shadow-popover) outline-none ${styles.container}`}
                onKeyDown={(event) => event.stopPropagation()}
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
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </TooltipProvider>
    );
  },
);

ModelSwitchPanel.displayName = 'ModelSwitchPanel';

export default ModelSwitchPanel;

export { ModelSwitchSubmenuPopup } from './SubmenuPopup';
export { type ModelSwitchPanelProps, type SimpleModelSource } from './types';
