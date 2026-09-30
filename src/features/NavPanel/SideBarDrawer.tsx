'use client';

import { Dialog } from '@base-ui/react/dialog';
import { createStaticStyles } from 'antd-style';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, Suspense, useEffect, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';

import SkeletonList from './components/SkeletonList';
import { NAV_PANEL_RIGHT_DRAWER_ID } from './constants';
import { OverlayContainerContext } from './OverlayContainer';
import SideBarHeaderLayout from './SideBarHeaderLayout';

const DRAWER_WIDTH = 280;

// Stays under the base-ui floating tier (1100) so dropdowns and popovers raised
// from inside the panel still paint above it.
const DRAWER_Z_INDEX = 1000;

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    overflow: hidden auto;
    flex: 1;
    min-height: 0;
    background: ${cssVar.colorBgLayout};
  `,
  popup: css`
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;

    overflow: hidden;
    display: flex;
    flex-direction: column;

    border-inline: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgLayout};
    box-shadow: 4px 0 8px -2px rgb(0 0 0 / 4%);

    transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);

    &[data-starting-style],
    &[data-ending-style] {
      transform: translateX(-100%);
    }
  `,
}));

interface SideBarDrawerProps {
  action?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  open: boolean;
  subHeader?: ReactNode;
  title?: ReactNode;
  /** Content that needs more room (e.g. rows with inline actions) can widen past the default. */
  width?: number;
}

const SideBarDrawer = memo<SideBarDrawerProps>(
  ({ subHeader, open, onClose, children, title, action, width = DRAWER_WIDTH }) => {
    const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
      setPortalContainer(document.querySelector<HTMLElement>(`#${NAV_PANEL_RIGHT_DRAWER_ID}`));
    }, []);

    return (
      <OverlayContainerContext value={overlayContainer}>
        <Dialog.Root
          modal={false}
          open={open}
          onOpenChange={(nextOpen, eventDetails) => {
            if (nextOpen || eventDetails.reason === 'outside-press') return;
            onClose();
          }}
        >
          <Dialog.Portal container={portalContainer}>
            <Dialog.Popup
              className={styles.popup}
              ref={setOverlayContainer}
              style={{ width, zIndex: DRAWER_Z_INDEX }}
            >
              <SideBarHeaderLayout
                showBack={false}
                left={
                  typeof title === 'string' ? (
                    <div
                      className="truncate text-[14px] font-[400]"
                      style={{ fontWeight: 600, paddingLeft: 8 }}
                    >
                      {title}
                    </div>
                  ) : (
                    title
                  )
                }
                right={
                  <>
                    {action}
                    <ActionIcon
                      icon={XIcon}
                      size={DESKTOP_HEADER_ICON_SMALL_SIZE}
                      style={{ marginInlineEnd: -2 }}
                      onClick={onClose}
                    />
                  </>
                }
              />
              {subHeader}
              <div className={styles.body}>
                <Suspense
                  fallback={
                    <div className="flex flex-col gap-[1px] py-[1px] px-1">
                      <SkeletonList rows={3} />
                    </div>
                  }
                >
                  {children}
                </Suspense>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </OverlayContainerContext>
    );
  },
);

export default SideBarDrawer;
