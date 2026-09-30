import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/version';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import SettingsUserStateBoundary from '@/features/Settings/features/SettingsUserStateBoundary';

import Conversation from './features/Conversation';
import Desktop from './features/Desktop';
import Essential from './features/Essential';

interface PageProps {
  showSettingHeader?: boolean;
}

const Page = ({ showSettingHeader = true }: PageProps) => {
  const { t } = useTranslation('setting');
  return (
    <>
      {showSettingHeader && <SettingHeader title={t('tab.hotkey')} />}
      {isDesktop && <Desktop />}
      <SettingsUserStateBoundary>
        <Essential />
        <Conversation />
      </SettingsUserStateBoundary>
    </>
  );
};

export default Page;
