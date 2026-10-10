'use client';

import { useLocation } from 'react-router';

import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import { getSettingsContentWidth } from '@/features/Setting/settingsWidth';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from '../Bar';
import SettingsProfileSkeleton from './Profile';
import SettingsSectionSkeleton from './Section';

const SettingsPageSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => {
  const { pathname } = useLocation();
  const tab = pathname.match(/\/settings\/([^/]+)/)?.[1] ?? 'profile';
  const profile = tab === 'profile';

  return (
    <div
      aria-busy
      className="flex flex-col flex-1 h-full"
      style={{ minHeight: 0, overflow: 'hidden' }}
    >
      {chrome !== 'body' && (
        <NavHeader styles={{ center: { alignItems: 'center' } }}>
          <SkeletonBar height={16} width={profile ? 52 : 88} />
        </NavHeader>
      )}
      <SettingContainer
        style={{ paddingBlock: '24px 128px', paddingInline: 24 }}
        width={getSettingsContentWidth(tab)}
      >
        {profile ? <SettingsProfileSkeleton /> : <SettingsSectionSkeleton />}
      </SettingContainer>
    </div>
  );
};

export default SettingsPageSkeleton;
