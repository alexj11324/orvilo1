import { cssVar } from 'antd-style';
import { XIcon } from 'lucide-react';
import { Suspense, useCallback } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { BrandTextLoading } from '@/components/Loading';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import LoginStep from '@/features/DesktopOnboarding/steps/LoginStep';
import { useElectronStore } from '@/store/electron';
import { isMacOS } from '@/utils/platform';

import RemoteStatus from './RemoteStatus';

const isMac = isMacOS();

const Connection = () => {
  const [isOpen, setConnectionDrawerOpen] = useElectronStore((s) => [
    s.isConnectionDrawerOpen,
    s.setConnectionDrawerOpen,
  ]);

  const handleClose = useCallback(() => {
    setConnectionDrawerOpen(false);
  }, [setConnectionDrawerOpen]);

  return (
    <>
      <RemoteStatus
        onClick={() => {
          setConnectionDrawerOpen(true);
        }}
      />
      <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          className="p-0"
          showCloseButton={false}
          side={'top'}
          style={{
            background: cssVar.colorBgLayout,
            height: '100vh',
          }}
        >
          <ActionIcon
            icon={XIcon}
            onClick={handleClose}
            // Clears the Electron title bar, which only overlaps the drawer off macOS.
            style={{
              insetBlockStart: isMac ? 12 : 46,
              insetInlineEnd: 6,
              position: 'absolute',
            }}
          />
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center" style={{ height: '100%' }}>
                <BrandTextLoading debugId="Connection" />
              </div>
            }
          >
            <div
              className="flex flex-col items-center justify-center"
              style={{ height: '100%', overflow: 'auto', padding: 24 }}
            >
              <div className="flex flex-col" style={{ maxWidth: 560, width: '100%' }}>
                <LoginStep mode={'status'} onBack={handleClose} onNext={handleClose} />
              </div>
            </div>
          </Suspense>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Connection;
