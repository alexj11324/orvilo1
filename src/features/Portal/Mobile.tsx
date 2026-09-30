'use client';

import { Modal } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { portalThreadSelectors } from '@/store/chat/selectors';

import { PortalContent } from './router';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    background: linear-gradient(${cssVar.colorBgElevated}, ${cssVar.colorBgContainer}) !important;
  `,
}));

const MobilePortal = () => {
  const [showMobilePortal, isPortalThread, clearPortalStack] = useChatStore((state) => [
    state.showPortal,
    portalThreadSelectors.showThread(state),
    state.clearPortalStack,
  ]);
  const { t } = useTranslation('portal');

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
    <Modal
      allowFullscreen
      className={cx(isPortalThread && styles.container)}
      draggable={false}
      footer={null}
      height={'95%'}
      open={showMobilePortal}
      title={t('title')}
      styles={{
        body: { padding: 0 },
        header: { display: 'none' },
      }}
      onCancel={() => clearPortalStack()}
    >
      <PortalContent renderBody={renderBody} />
    </Modal>
  );
};

export default MobilePortal;
