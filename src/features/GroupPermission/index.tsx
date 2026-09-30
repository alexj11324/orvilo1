'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import SurfaceSkeleton from '@/components/Skeleton/Surface';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { StyleSheet } from '@/utils/styles';

import GroupBreadcrumb from './GroupBreadcrumb';
import PermissionForm from './PermissionForm';

const styles = StyleSheet.create({
  body: {
    display: 'flex',
    overflowY: 'auto',
    position: 'relative',
  },
});

const GroupPermission = memo(() => {
  const { t } = useTranslation('setting');
  const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  // The group row itself is what the form reads (visibility / workspace); until
  // it lands the page would otherwise render the personal-group empty state,
  // which is a different fact.
  const isGroupLoading = useAgentGroupStore(agentGroupSelectors.isGroupsInit);

  return (
    <div className="flex flex-col h-full w-full">
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          activeGroupId ? (
            <GroupBreadcrumb groupId={activeGroupId} title={t('permission.page.title')} />
          ) : null
        }
      />
      <div className="flex flex-col flex-1 w-full" style={{ ...styles.body }}>
        <WideScreenContainer>
          <div className="flex flex-col gap-4 py-4">
            <AsyncBoundary
              data={isGroupLoading ? undefined : true}
              isLoading={isGroupLoading}
              loading={<SurfaceSkeleton header={false} variant={'form'} />}
            >
              <PermissionForm groupId={activeGroupId ?? ''} />
            </AsyncBoundary>
          </div>
        </WideScreenContainer>
      </div>
    </div>
  );
});

GroupPermission.displayName = 'GroupPermission';

export default GroupPermission;
