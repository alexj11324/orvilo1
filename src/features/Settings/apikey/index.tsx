import { useTranslation } from 'react-i18next';

import { WorkspaceApiKeyGuard } from '@/business/client/BusinessSettingPages/WorkspaceApiKeyGuard';
import SettingHeader from '@/features/Settings/features/SettingHeader';

import ApiKey from './features/ApiKey';

interface PageProps {
  showSettingHeader?: boolean;
}

const Page = ({ showSettingHeader = true }: PageProps) => {
  const { t } = useTranslation('setting');
  return (
    <>
      {showSettingHeader && <SettingHeader title={t('tab.apikey')} />}
      {/* Keys act as the member who issued them; the guard is the role gate. */}
      <WorkspaceApiKeyGuard>
        <ApiKey />
      </WorkspaceApiKeyGuard>
    </>
  );
};

export default Page;
