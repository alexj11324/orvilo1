import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { BrandTextLoading } from '@/components/Loading';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import LoginStep from '@/features/DesktopOnboarding/steps/LoginStep';
import { useElectronStore } from '@/store/electron';
import { isMacOS } from '@/utils/platform';

import RemoteStatus from './RemoteStatus';

const isMac = isMacOS();

const Connection = () => {
  const { t } = useTranslation('electron');
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
          className="bg-background p-0 data-[side=top]:h-screen"
          showCloseButton={false}
          side={'top'}
        >
          <SheetTitle className="sr-only">{t('remoteServer.configTitle')}</SheetTitle>
          {/* Clears the Electron title bar, which only overlaps the drawer off macOS. */}
          <ActionIcon
            className={cn('absolute end-1.5', isMac ? 'top-3' : 'top-[46px]')}
            icon={XIcon}
            onClick={handleClose}
          />
          <Suspense
            fallback={
              <div className="flex h-full flex-col items-center justify-center">
                <BrandTextLoading debugId="Connection" />
              </div>
            }
          >
            <div className="flex h-full flex-col items-center justify-center overflow-auto p-6">
              <div className="flex w-full max-w-[560px] flex-col">
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
