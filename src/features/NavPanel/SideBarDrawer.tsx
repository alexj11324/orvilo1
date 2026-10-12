'use client';

import { Dialog } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, Suspense, useEffect, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';

import SkeletonList from './components/SkeletonList';
import { NAV_PANEL_RIGHT_DRAWER_ID } from './constants';
import { OverlayContainerContext } from './OverlayContainer';
import SideBarHeaderLayout from './SideBarHeaderLayout';

const DRAWER_WIDTH = 280;

// Stays under the base-ui floating tier (1100) so dropdowns and popovers raised
// from inside the panel still paint above it.
const DRAWER_Z_INDEX = 1000;

// Non-modal overlay depth follows the shared popover role; this is a design
// role correction rather than an exact copy of the old directional shadow.
const popupClassName =
  'absolute inset-y-0 start-0 flex flex-col overflow-hidden rounded-(--radius-overlay) border-x border-divider bg-background shadow-(--shadow-popover) transition-transform duration-(--orvilo-motion-slow) ease-[cubic-bezier(0.32,0.72,0,1)] data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full rtl:data-[starting-style]:translate-x-full rtl:data-[ending-style]:translate-x-full';

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
              className={popupClassName}
              ref={setOverlayContainer}
              style={{ width, zIndex: DRAWER_Z_INDEX }}
            >
              <SideBarHeaderLayout
                showBack={false}
                left={
                  typeof title === 'string' ? (
                    <div className="truncate ps-2 text-sm font-semibold">{title}</div>
                  ) : (
                    title
                  )
                }
                right={
                  <>
                    {action}
                    <ActionIcon
                      className="-me-0.5"
                      icon={XIcon}
                      size={{ blockSize: 24, borderRadius: 'var(--radius-button)', size: 16 }}
                      onClick={onClose}
                    />
                  </>
                }
              />
              {subHeader}
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
                <Suspense
                  fallback={
                    <div className="flex flex-col gap-px py-px px-1">
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
