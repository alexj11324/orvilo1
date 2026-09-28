import { Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, type DropdownItem, DropdownMenu } from '@lobehub/ui/base-ui';
import { MoreHorizontal, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { mutate as globalMutate } from '@/libs/swr';
import { verifyKeys } from '@/libs/swr/keys';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import Header from '../components/Header';
import Title from './Title';

const AcceptanceHeader = memo(() => {
  const { t } = useTranslation('verify');
  const acceptanceId = useChatStore(chatPortalSelectors.acceptancePortalId);

  // This panel IS the acceptance's destination. The standalone
  // `/acceptance/:id` page was retired with the standalone platform, so there
  // is no longer a page URL to copy or to hand to the system browser — the
  // only external reference left would be a link into a redirect.
  const menuItems: DropdownItem[] = [
    {
      disabled: !acceptanceId,
      icon: <Icon icon={RefreshCw} />,
      key: 'refresh',
      label: t('acceptance.actions.refresh'),
      onClick: () => {
        if (!acceptanceId) return;
        void globalMutate(verifyKeys.acceptanceBundle(acceptanceId));
      },
    },
  ];

  return (
    <Header
      paddingInline={24}
      title={
        <Flexbox horizontal align={'center'} gap={2} style={{ minWidth: 0 }}>
          <Title />
          <DropdownMenu
            iconSpaceMode={'group'}
            items={menuItems}
            placement={'bottomLeft'}
            popupProps={{ style: { minWidth: 140 } }}
          >
            <ActionIcon
              icon={MoreHorizontal}
              size={'small'}
              style={{ flex: 'none' }}
              title={t('acceptance.actions.more')}
            />
          </DropdownMenu>
        </Flexbox>
      }
    />
  );
});

export default AcceptanceHeader;
