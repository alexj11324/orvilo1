import { memo } from 'react';

import { PanelContent } from './components/PanelContent';
import { MenuPanelPopup } from './menu';
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
 * The caller supplies the submenu root (`DropdownMenuSub`) and its trigger row.
 */
export const ModelSwitchSubmenuPopup = memo<ModelSwitchSubmenuPopupProps>(
  ({ model, onModelChange, onOpenChange, provider }) => (
    <MenuPanelPopup
      alignOffset={-4}
      className={styles.container}
      placement="right"
      sideOffset={8}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <PanelContent
        model={model}
        provider={provider}
        onModelChange={onModelChange}
        onOpenChange={onOpenChange}
      />
    </MenuPanelPopup>
  ),
);

ModelSwitchSubmenuPopup.displayName = 'ModelSwitchSubmenuPopup';
