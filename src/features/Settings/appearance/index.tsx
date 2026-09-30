import { useTranslation } from 'react-i18next';

import SettingHeader from '@/features/Settings/features/SettingHeader';
import SettingsUserStateBoundary from '@/features/Settings/features/SettingsUserStateBoundary';

import ChatAppearance from '../chat-appearance/features/ChatAppearance';
import Appearance from '../common/features/Appearance';
import Common from '../common/features/Common/Common';
import Collaboration from './features/Collaboration';
import Desktop from './features/Desktop';
import Font from './features/Font';

interface PageProps {
  showSettingHeader?: boolean;
}

const Page = ({ showSettingHeader = true }: PageProps) => {
  const { t } = useTranslation('setting');
  return (
    <>
      {showSettingHeader && <SettingHeader title={t('tab.appearance')} />}
      <SettingsUserStateBoundary localContent={<Desktop />}>
        <Common />
        <Appearance />
        <Collaboration />
        <Desktop />
        <Font />
        <ChatAppearance />
      </SettingsUserStateBoundary>
    </>
  );
};

export default Page;
