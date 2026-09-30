import { type UIChatMessage } from '@orvilo/types';
import { t } from 'i18next';
import { memo, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal } from '@/components/Modal';
import { Tabs } from '@/components/ui/tabs';
import ShareDataProvider from '@/features/ShareModal/ShareDataProvider';
import SharePdf from '@/features/ShareModal/SharePdf';
import { useIsMobile } from '@/hooks/useIsMobile';

import type { createStore } from '../../store';
import { Provider, useConversationStore } from '../../store';
import ShareImage from './ShareImage';
import ShareText from './ShareText';

enum Tab {
  PDF = 'pdf',
  Screenshot = 'screenshot',
  Text = 'text',
}

interface ShareMessageModalContentProps {
  message: UIChatMessage;
}

const ShareMessageModalContent = memo<ShareMessageModalContentProps>(({ message }) => {
  const [tab, setTab] = useState<Tab>(Tab.Screenshot);
  const { t } = useTranslation('chat');
  const uniqueId = useId();
  const isMobile = useIsMobile();
  const context = useConversationStore((s) => s.context);

  const tabItems = useMemo(() => {
    const items = [
      {
        children: <ShareImage message={message} mobile={isMobile} uniqueId={uniqueId} />,
        key: Tab.Screenshot,
        label: t('shareModal.screenshot'),
      },
      {
        children: <ShareText item={message} />,
        key: Tab.Text,
        label: t('shareModal.text'),
      },
      {
        children: (
          <ShareDataProvider context={context}>
            <SharePdf message={message} />
          </ShareDataProvider>
        ),
        key: Tab.PDF,
        label: t('shareModal.pdf'),
      },
    ];

    return items;
  }, [context, isMobile, message, uniqueId, t]);

  return (
    <div className="flex flex-col" style={{ gap: isMobile ? 8 : 24 }}>
      <Tabs value={tab} onValueChange={(key) => setTab(key as Tab)}>
        <TabsList style={{ display: 'flex', width: '100%' }}>
          {tabItems.map((item) => (
            <TabsTrigger
              disabled={item.disabled}
              key={item.key}
              style={{ flex: 1 }}
              value={item.key}
            >
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {(tabItems as { children?: React.ReactNode; key: string }[]).map(
          (item) =>
            item.children != null && (
              <TabsContent key={item.key} value={item.key}>
                {item.children}
              </TabsContent>
            ),
        )}
      </Tabs>
    </div>
  );
});

ShareMessageModalContent.displayName = 'ShareMessageModalContent';

export const openShareMessageModal = (
  message: UIChatMessage,
  createConversationStore: () => ReturnType<typeof createStore>,
) =>
  createModal({
    content: (
      <Provider createStore={createConversationStore}>
        <ShareMessageModalContent message={message} />
      </Provider>
    ),
    footer: null,
    maskClosable: true,
    title: t('share', { ns: 'common' }),
    width: 'min(95vw, 1440px)',
  });
