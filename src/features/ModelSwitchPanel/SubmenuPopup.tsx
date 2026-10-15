import { Menu } from '@base-ui/react/menu';
import { memo } from 'react';

import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { getFloatingCollisionPadding } from '@/libs/contextMenu/collisionPadding';

import { PanelContent } from './components/PanelContent';
import { styles } from './styles';

interface ModelSwitchSubmenuPopupProps {
  model?: string;
  onModelChange?: (params: { model: string; provider: string }) => Promise<void>;
  /** Called with `false` once a row is picked, so the host can close its whole menu. */
  onOpenChange?: (open: boolean) => void;
  provider?: string;
}

/**
 * The model panel mounted as a nested submenu instead of its own dropdown, for
 * hosts that fold model selection into a larger menu (chat input model + effort).
 * The caller supplies the `DropdownMenuSubmenuRoot` and its trigger row.
 */
export const ModelSwitchSubmenuPopup = memo<ModelSwitchSubmenuPopupProps>(
  ({ model, onModelChange, onOpenChange, provider }) => (
    <Menu.Portal>
      <Menu.Positioner
        align="center"
        alignOffset={-4}
        anchor={null}
        className={POPUP_Z_CLASS}
        collisionPadding={getFloatingCollisionPadding()}
        side="right"
        sideOffset={8}
      >
        <Menu.Popup
          className={`${POPUP_Z_CLASS} rounded-(--radius-overlay) bg-popover text-popover-foreground shadow-(--shadow-popover) outline-none ${styles.container}`}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <PanelContent
            model={model}
            provider={provider}
            onModelChange={onModelChange}
            onOpenChange={onOpenChange}
          />
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  ),
);

ModelSwitchSubmenuPopup.displayName = 'ModelSwitchSubmenuPopup';
