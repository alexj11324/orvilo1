import { type CSSProperties } from 'react';
import React, { memo, useCallback, useMemo } from 'react';

import LibraryStatusIcon from '@/components/LibIcon/StatusIcon';
import { Spinner } from '@/components/ui/spinner';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useKnowledgeBaseStore } from '@/store/library';

import Actions from './Actions';
import { useDropdownMenu } from './useDropdownMenu';

interface KnowledgeBaseItemProps {
  active?: boolean;
  className?: string;
  description?: string | null;
  id: string;
  memberRestricted?: boolean;
  name: string;
  permissionManageable?: boolean;
  style?: CSSProperties;
  userId?: string;
  visibility?: 'private' | 'public';
}

const KnowledgeBaseItem = memo<KnowledgeBaseItemProps>(
  ({ id, name, active, style, className, visibility, memberRestricted, permissionManageable }) => {
    const setLibraryId = useResourceManagerStore((s) => s.setLibraryId);
    const navigate = useWorkspaceAwareNavigate();
    const dropdownMenu = useDropdownMenu({ id, permissionManageable });
    const isLoading = useKnowledgeBaseStore((s) => s.knowledgeBaseLoadingIds.includes(id));
    const handleClick = useCallback(() => {
      navigate(`/resource/library/${id}`);
      setLibraryId(id);
    }, [navigate, id, setLibraryId]);

    // Restricted (No-access) KBs are invisible to plain members, so this row
    // only renders for managers — the lock tells them at a glance which shared
    // KBs members cannot open. The flag rides on the list query, so it costs
    // no per-row permission request.
    const isMemberRestricted = visibility === 'public' && !!memberRestricted;

    // Keep the same private / restricted / workspace icon language as the
    // active-library header and its switcher.
    const icon = useMemo(() => {
      if (isLoading) {
        return <Spinner className="size-4.5 text-muted-foreground" />;
      }

      return (
        <LibraryStatusIcon
          memberRestricted={isMemberRestricted}
          size={18}
          visibility={visibility}
        />
      );
    }, [isLoading, visibility, isMemberRestricted]);

    return (
      <div style={{ position: 'relative' }}>
        <NavItem
          actions={permissionManageable ? <Actions dropdownMenu={dropdownMenu} /> : undefined}
          active={active}
          className={className}
          contextMenuItems={dropdownMenu}
          icon={icon}
          key={id}
          loading={isLoading}
          style={style}
          title={name}
          onClick={handleClick}
        />
      </div>
    );
  },
);

export default KnowledgeBaseItem;
