'use client';

import { cn } from 'cn';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { isDesktop } from '@/const/version';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { isMacOS } from '@/utils/platform';

export const TOGGLE_BUTTON_ID = 'toggle_left_panel_button';

// On macOS desktop a persistent toggle lives in the titlebar (NavigationBar),
// so in-page instances hide themselves to avoid duplicate collapse buttons.
export const isMacDesktop = isDesktop && isMacOS();

interface ToggleLeftPanelButtonProps {
  /**
   * Render even on macOS desktop, where in-page instances hide by default.
   * The persistent titlebar toggle sets this.
   */
  forceVisible?: boolean;
  icon?: ReactNode;
  /**
   * DOM id for the button. Defaults to the shared {@link TOGGLE_BUTTON_ID} which
   * NavPanelDraggable targets for its hover-reveal CSS. Pass a custom id (or `null`)
   * to opt out — e.g. for a persistent instance rendered outside the sidebar panel,
   * to avoid duplicate ids and the hover-hide behavior.
   */
  id?: string | null;
  showActive?: boolean;
  size?: 'default' | 'small';
  title?: ReactNode;
}

const ToggleLeftPanelButton = memo<ToggleLeftPanelButtonProps>(
  ({ title, showActive, icon, size = 'small', id = TOGGLE_BUTTON_ID, forceVisible }) => {
    const [expand, togglePanel] = useGlobalStore((s) => [
      s.leftPanelDrawerMode
        ? (s.leftPanelDrawerOpen ?? false)
        : systemStatusSelectors.showLeftPanel(s),
      s.toggleLeftPanel,
    ]);

    const { t } = useTranslation(['hotkey']);

    if (isMacDesktop && !forceVisible) return null;

    return (
      <Button
        aria-label={typeof title === 'string' ? title : t('toggleLeftPanel.title')}
        aria-pressed={expand}
        className={cn(showActive && expand && 'bg-muted')}
        id={id ?? undefined}
        size={size === 'small' ? 'icon-sm' : 'icon'}
        title={typeof title === 'string' ? title : t('toggleLeftPanel.title')}
        variant="ghost"
        onClick={() => togglePanel()}
      >
        {icon || (expand ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />)}
      </Button>
    );
  },
);

export default ToggleLeftPanelButton;
