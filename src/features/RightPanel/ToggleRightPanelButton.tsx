'use client';

import { ActionIcon, type ActionIconProps } from '@lobehub/ui/base-ui';
import { HotkeyEnum } from '@orvilo/const/hotkeys';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

export const TOGGLE_BUTTON_ID = 'toggle_right_panel_button';

interface ToggleRightPanelButtonProps {
  /**
   * Override the panel's expanded state. When provided together with `onToggle`,
   * the button uses these instead of the global `showRightPanel` store.
   */
  expand?: boolean;
  hideWhenExpanded?: boolean;
  icon?: ActionIconProps['icon'];
  /**
   * DOM id for the button. Defaults to the shared {@link TOGGLE_BUTTON_ID}.
   * Pass `null` for a secondary instance rendered alongside a page-header
   * toggle so the two never share one id.
   */
  id?: string | null;
  onToggle?: () => void;
  showActive?: boolean;
  size?: ActionIconProps['size'];
  title?: ReactNode;
}

const ToggleRightPanelButton = memo<ToggleRightPanelButtonProps>(
  ({
    title,
    showActive,
    icon,
    hideWhenExpanded,
    size,
    expand: expandProp,
    onToggle,
    id = TOGGLE_BUTTON_ID,
  }) => {
    const [globalExpand, globalToggle, isStatusInit] = useGlobalStore((s) => [
      systemStatusSelectors.showRightPanel(s),
      s.toggleRightPanel,
      systemStatusSelectors.isStatusInit(s),
    ]);
    const hotkey = useUserStore(settingsSelectors.getHotkeyById(HotkeyEnum.ToggleRightPanel));

    const { t } = useTranslation(['chat', 'hotkey']);

    const expand = expandProp ?? globalExpand;
    const handleClick = onToggle ?? (() => globalToggle());

    // Defer render until status hydrates when relying on the global store —
    // toggleRightPanel is a no-op while !isStatusInit and clicks would be
    // silently dropped. Callers that pass `expand`+`onToggle` override this.
    if (expandProp === undefined && !isStatusInit) return null;

    if (hideWhenExpanded && expand) return null;
    return (
      <ActionIcon
        active={showActive ? expand : undefined}
        icon={icon || (expand ? PanelRightClose : PanelRightOpen)}
        id={id ?? undefined}
        size={size || DESKTOP_HEADER_ICON_SMALL_SIZE}
        title={title || t('toggleRightPanel.title', { ns: 'hotkey' })}
        tooltipProps={{
          hotkey,
          placement: 'bottom',
        }}
        onClick={handleClick}
      />
    );
  },
);

export default ToggleRightPanelButton;
