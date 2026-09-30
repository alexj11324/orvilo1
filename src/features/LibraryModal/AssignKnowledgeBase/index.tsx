import { createModal, type ModalInstance } from '@lobehub/ui/base-ui';
import { t } from 'i18next';
import { memo } from 'react';

import { useServerConfigStore } from '@/store/serverConfig';

import List from './List';

const Content = memo(() => {
  const mobile = useServerConfigStore((s) => s.isMobile);

  return (
    <div
      className="flex flex-col w-[100%]"
      style={{ maxHeight: mobile ? '-webkit-fill-available' : 'inherit', gap: mobile ? 8 : 16 }}
    >
      <List />
    </div>
  );
});

export const openAttachKnowledgeModal = (): ModalInstance =>
  createModal({
    content: <Content />,
    footer: false,
    styles: { content: { overflow: 'hidden' } },
    title: t('knowledgeBase.library.title', { ns: 'chat' }),
    width: 600,
  });
