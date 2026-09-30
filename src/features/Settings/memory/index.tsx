'use client';

import { useTranslation } from 'react-i18next';

import SettingHeader from '@/features/Settings/features/SettingHeader';
import SettingsUserStateBoundary from '@/features/Settings/features/SettingsUserStateBoundary';

import InterestsRow from '../profile/features/InterestsRow';
import { ManageMemoryButton } from './features/ManageMemoryButton';
import Memory from './features/Memory';

interface PageProps {
  showSettingHeader?: boolean;
}

const Page = ({ showSettingHeader = true }: PageProps) => {
  const { t } = useTranslation('setting');
  return (
    <>
      {showSettingHeader && (
        <SettingHeader extra={<ManageMemoryButton />} title={t('tab.memory')} />
      )}
      <SettingsUserStateBoundary>
        <InterestsRow />
        <Memory />
      </SettingsUserStateBoundary>
    </>
  );
};

export default Page;
