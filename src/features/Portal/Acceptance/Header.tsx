import { MoreHorizontal, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import type { DropdownItem } from '@/components/ItemsMenu';
import { DropdownMenu } from '@/components/ItemsMenu';
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
      icon: (
        <span className="anticon" role="img">
          <RefreshCw fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
      ),
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
        <div className="flex flex-row items-center gap-0.5" style={{ minWidth: 0 }}>
          <Title />
          <DropdownMenu items={menuItems} placement={'bottomLeft'} popupClassName="min-w-[140px]">
            <ActionIcon
              icon={MoreHorizontal}
              size={'small'}
              style={{ flex: 'none' }}
              title={t('acceptance.actions.more')}
            />
          </DropdownMenu>
        </div>
      }
    />
  );
});

export default AcceptanceHeader;
