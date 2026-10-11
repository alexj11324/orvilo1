'use client';

import { cn } from 'cn';
import { Maximize2, Minimize2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors } from '@/store/chat/selectors';

import { PortalContent } from './router';

const styles = {
  // This bottom Sheet is application overlay chrome, not authored content art.
  container: 'bg-popover',
  fullscreenToggle:
    'absolute inset-bs-2 end-2 z-10 border-0 bg-transparent p-0 text-foreground-tertiary hover:bg-accent hover:text-foreground',
} as const;

const MobilePortalContent = ({
  isPortalThread,
  open,
  renderBody,
}: {
  isPortalThread: boolean;
  open: boolean;
  renderBody: (body: ReactNode) => ReactNode;
}) => {
  const { t } = useTranslation('portal');
  const [fullscreen, setFullscreen] = useState(false);
  // `onOpenChange` does not fire when the store flips `open` externally, so
  // resync during render — the flag must never survive a close.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setFullscreen(false);
  }

  return (
    <SheetContent
      showCloseButton={false}
      side={'bottom'}
      style={{ height: fullscreen ? '100%' : '95%' }}
      className={cn(
        'gap-0 rounded-t-(--radius-overlay) p-0',
        isPortalThread && styles.container,
        fullscreen && 'data-[side=bottom]:rounded-none',
      )}
    >
      <SheetTitle className={'sr-only'}>{t('title')}</SheetTitle>
      <Button
        aria-label={t(fullscreen ? 'exitFullscreen' : 'fullscreen')}
        className={styles.fullscreenToggle}
        size="icon"
        type="button"
        variant="ghost"
        onClick={() => setFullscreen((prev) => !prev)}
      >
        {fullscreen ? (
          <Minimize2 className="size-4" size={16} />
        ) : (
          <Maximize2 className="size-4" size={16} />
        )}
      </Button>
      <PortalContent renderBody={renderBody} />
    </SheetContent>
  );
};

const MobilePortal = () => {
  const [showMobilePortal, isPortalThread, clearPortalStack] = useChatStore((state) => [
    state.showPortal,
    portalThreadSelectors.showThread(state),
    state.clearPortalStack,
  ]);

  const renderBody = (body: ReactNode) => (
    <div className="flex flex-col gap-2 h-[calc(100%_-_52px)] overflow-hidden px-2">
      <div className="relative flex flex-col h-full w-[calc(100%_+_16px)] -mx-2 overflow-hidden">
        {body}
      </div>
    </div>
  );

  return (
    // Declarative rather than `createModal`: the portal body reaches for route
    // params (`useParams` in its header), and an imperative modal renders in the
    // global ModalHost — above every route match, where those params are empty.
    <Sheet open={showMobilePortal} onOpenChange={(next) => !next && clearPortalStack()}>
      <MobilePortalContent
        isPortalThread={isPortalThread}
        open={showMobilePortal}
        renderBody={renderBody}
      />
    </Sheet>
  );
};

export default MobilePortal;
