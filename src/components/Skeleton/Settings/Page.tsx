'use client';

import { useLocation } from 'react-router';

import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from '../Bar';
import SettingsProfileSkeleton from './Profile';
import SettingsSectionSkeleton from './Section';

const SettingsPageSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => {
  const { pathname } = useLocation();
  const tab = pathname.match(/\/settings\/([^/]+)/)?.[1] ?? 'profile';
  const profile = tab === 'profile';

  return (
    <div aria-busy className={'flex flex-col flex-1'} style={{ minHeight: 0, overflow: 'hidden' }}>
      {chrome !== 'body' && (
        <NavHeader styles={{ center: { alignItems: 'center' } }}>
          <SkeletonBar height={16} width={profile ? 52 : 88} />
        </NavHeader>
      )}
      <SettingContainer maxWidth={1024} paddingBlock={'24px 128px'} paddingInline={24}>
        {profile ? <SettingsProfileSkeleton /> : <SettingsSectionSkeleton />}
      </SettingContainer>
    </div>
  );
};

export default SettingsPageSkeleton;
