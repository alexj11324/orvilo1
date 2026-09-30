import { type ReactNode } from 'react';

import AsyncError from '@/components/AsyncError';
import SettingsSectionSkeleton from '@/components/Skeleton/Settings/Section';

import { useSettingsUserState } from './useSettingsUserState';

/** Cloud settings must stop loading after bootstrap fails. Local preferences remain usable. */
const SettingsUserStateBoundary = ({
  children,
  localContent,
}: {
  children: ReactNode;
  localContent?: ReactNode;
}) => {
  const { ready, error, retrying, retry } = useSettingsUserState();

  if (ready) return children;

  return (
    <>
      {error ? (
        <AsyncError
          error={error}
          retrying={retrying}
          variant={'block'}
          onRetry={() => void retry()}
        />
      ) : (
        <SettingsSectionSkeleton />
      )}
      {localContent}
    </>
  );
};

export default SettingsUserStateBoundary;
