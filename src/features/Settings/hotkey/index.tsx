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
  // The host/device boundary allowlist caps `isDesktop` reads per file, so the
  // flag is read once here and threaded to the sections below.
  const desktop = isDesktop;
  return (
    <>
      {showSettingHeader && <SettingHeader title={t('tab.hotkey')} />}
      {desktop && <Desktop />}
      <SettingsUserStateBoundary>
        <Essential desktop={desktop} />
        <Conversation desktop={desktop} />
      </SettingsUserStateBoundary>
    </>
  );
};

export default Page;
