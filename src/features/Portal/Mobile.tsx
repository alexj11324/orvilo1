'use client';

import { createStaticStyles, cx } from 'antd-style';
import { Maximize2, Minimize2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors } from '@/store/chat/selectors';

import { PortalContent } from './router';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    background: linear-gradient(${cssVar.colorBgElevated}, ${cssVar.colorBgContainer}) !important;
  `,
  fullscreenToggle: css`
    cursor: pointer;

    position: absolute;
    z-index: 10;
    inset-block-start: 8px;
    inset-inline-end: 8px;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 12px;

    color: ${cssVar.colorTextTertiary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
}));

const MobilePortal = () => {
  const [showMobilePortal, isPortalThread, clearPortalStack] = useChatStore((state) => [
    state.showPortal,
    portalThreadSelectors.showThread(state),
    state.clearPortalStack,
  ]);
  const { t } = useTranslation('portal');
  // Mirrors the legacy Modal's `allowFullscreen`: a header toggle switches the
  // panel between its `height` (95%) and the full viewport, and the flag
  // resets whenever the sheet closes.
  const [fullscreen, setFullscreen] = useState(false);

  const renderBody = (body: ReactNode) => (
    <div
      className="flex flex-col gap-2 h-[calc(100%_-_52px)]"
      style={{ overflow: 'hidden', padding: '0 8px' }}
    >
      <div
        className="flex flex-col h-[100%] w-[calc(100%_+_16px)]"
        style={{ marginInline: -8, overflow: 'hidden', position: 'relative' }}
      >
        {body}
      </div>
    </div>
  );

  return (
    // Declarative rather than `createModal`: the portal body reaches for route
    // params (`useParams` in its header), and an imperative modal renders in the
    // global ModalHost — above every route match, where those params are empty.
    <Sheet
      open={showMobilePortal}
      onOpenChange={(next) => {
        if (next) return;
        setFullscreen(false);
        clearPortalStack();
      }}
    >
      <SheetContent
        className={cx('gap-0 rounded-t-2xl p-0', isPortalThread && styles.container)}
        showCloseButton={false}
        side={'bottom'}
        style={{ height: fullscreen ? '100%' : '95%' }}
      >
        <SheetTitle className={'sr-only'}>{t('title')}</SheetTitle>
        <button
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className={styles.fullscreenToggle}
          type="button"
          onClick={() => setFullscreen((prev) => !prev)}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <PortalContent renderBody={renderBody} />
      </SheetContent>
    </Sheet>
  );
};

export default MobilePortal;
