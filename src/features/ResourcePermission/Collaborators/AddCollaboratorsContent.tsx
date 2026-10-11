'use client';

import { MAX_RESOURCE_COLLABORATORS_PER_ADD } from '@orvilo/const';
import { useHover } from 'ahooks';
import { cn } from 'cn';
import { CheckIcon, SearchXIcon, UsersIcon } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFetchWorkspaceMembers } from '@/business/client/hooks/useFetchWorkspaceMembers';
import { useWorkspaceMembers } from '@/business/client/hooks/useWorkspaceMembers';
import Avatar from '@/components/Avatar';
import { useModalContext } from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import SimpleEmpty from '@/components/SimpleEmpty';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PermissionResourceType, ResourceAccessLevel } from '@/services/resourcePermission';

import { useResourceCollaborators } from '../useResourceCollaborators';
import { useResourcePermission } from '../useResourcePermission';

const styles = {
  footer: 'py-3 px-5 border-bs border-divider',
  header: 'pbs-1 pbe-3 px-5',
  list: 'select-none overflow-y-auto h-[clamp(240px,calc(100dvh_-_320px),360px)] pbe-2 px-3',
  row: 'cursor-pointer my-0.5 py-2.5 px-3 rounded-(--radius-card) transition-[background-color] duration-(--orvilo-motion-mid) ease-in-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1',
  rowIndicator: 'inline-flex items-center justify-center ms-auto ps-2 text-primary-text',
  rowSelected: 'bg-selected hover:bg-selected',
};

/**
 * Structural shape shared by the OSS stub's membership rows and the cloud
 * store's RBAC-projected rows — the business-slot module does not export a
 * common type, and each side names its own.
 */
interface MemberCandidate {
  role?: string | null;
  user?: {
    avatar?: string | null;
    email?: string | null;
    fullName?: string | null;
    username?: string | null;
  } | null;
  userId: string;
}

const memberName = (member: MemberCandidate) =>
  member.user?.fullName || member.user?.username || member.user?.email || member.userId;

/**
 * Workspace admins hold `:all` update capability and bypass Member
 * Permissions entirely, so offering them as collaborator targets would
 * present a control that changes nothing.
 */
const PRIVILEGED_ROLES = new Set(['admin', 'owner']);

const MemberRow = memo<{
  member: MemberCandidate;
  onToggle: (userId: string) => void;
  selected: boolean;
}>(({ member, onToggle, selected }) => {
  const ref = useRef(null);
  const isHovering = useHover(ref);

  const name = memberName(member);
  const email = member.user?.email;

  return (
    <div
      aria-selected={selected}
      ref={ref}
      role={'option'}
      tabIndex={0}
      className={cn(
        'flex flex-row items-center gap-3',
        cn(styles.row, selected ? styles.rowSelected : 'hover:bg-accent'),
      )}
      onClick={() => onToggle(member.userId)}
      onKeyDown={(e) => {
        // Focus lands here by Tab out of the search field; Enter and Space are
        // what a listbox option is expected to answer to. Space would scroll
        // the list without the preventDefault.
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onToggle(member.userId);
      }}
    >
      <Avatar
        animation={isHovering}
        avatar={member.user?.avatar || undefined}
        size={40}
        title={name}
      />
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="truncate min-w-0 text-sm leading-5.5 font-medium">{name}</div>
        {email && email !== name ? (
          <div className="truncate min-w-0 text-xs text-muted-foreground">{email}</div>
        ) : null}
      </div>
      {/* Select-option style: the selected state reads as a primary check on
          the trailing edge, mirroring base-ui Select's ItemIndicator. */}
      {selected ? (
        <span className={styles.rowIndicator}>
          <span className="anticon" role="img">
            <CheckIcon fill={'transparent'} height={'16'} size={'16'} width={'16'} />
          </span>
        </span>
      ) : null}
    </div>
  );
});

MemberRow.displayName = 'AddCollaboratorMemberRow';

interface AddCollaboratorsContentProps {
  /** The level a new collaborator receives — single-level per resource type today. */
  grantLevel: ResourceAccessLevel;
  resourceId: string;
  resourceType: PermissionResourceType;
}

const AddCollaboratorsContent = memo<AddCollaboratorsContentProps>(
  ({ grantLevel, resourceId, resourceType }) => {
    const { t } = useTranslation('setting');
    const { close } = useModalContext();

    const { isLoading: membersLoading } = useFetchWorkspaceMembers();
    const members: MemberCandidate[] = useWorkspaceMembers();
    const { data: permission } = useResourcePermission(resourceType, resourceId);
    const { addCollaborators, collaborators, mutating } = useResourceCollaborators(
      resourceType,
      resourceId,
    );

    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    const candidates = useMemo(() => {
      const existing = new Set((collaborators ?? []).map((item) => item.userId));
      const list = members.filter((member) => {
        if (resourceType !== 'agent' && member.role && PRIVILEGED_ROLES.has(member.role))
          return false;
        if (resourceType !== 'agent' && member.userId === permission?.creatorId) return false;
        return !existing.has(member.userId);
      });
      // Large workspaces list dozens of members — a stable alphabetical order
      // makes the list scannable beyond what search alone covers.
      return list.sort((a, b) => memberName(a).localeCompare(memberName(b)));
    }, [members, collaborators, permission?.creatorId, resourceType]);

    const filtered = useMemo(() => {
      const keyword = query.trim().toLowerCase();
      if (!keyword) return candidates;
      return candidates.filter((member) =>
        [member.user?.fullName, member.user?.username, member.user?.email]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(keyword)),
      );
    }, [candidates, query]);

    const toggle = (userId: string) => {
      if (selected.includes(userId)) {
        setSelected((prev) => prev.filter((id) => id !== userId));
        return;
      }
      // The procedure refuses a longer batch outright, so stop the selection at
      // the cap and say why — otherwise the whole hand-assembled selection is
      // rejected at confirm time, after the work of making it.
      if (selected.length >= MAX_RESOURCE_COLLABORATORS_PER_ADD) {
        toast.warning(
          t('permission.collaborators.addModal.selectionLimit', {
            count: MAX_RESOURCE_COLLABORATORS_PER_ADD,
          }),
        );
        return;
      }
      setSelected((prev) => [...prev, userId]);
    };

    const handleConfirm = async () => {
      // Only dismiss once the grant actually landed — the hook reports failure
      // through a toast, and closing anyway would discard the selection while
      // adding nobody.
      const added = await addCollaborators(selected, grantLevel);
      if (added) close();
    };

    const isInitialLoading = membersLoading && members.length === 0;
    // A zero-result search must read as "no match", never as the first-run
    // "nobody to add" state — they call for different user reactions.
    const isSearchMiss = filtered.length === 0 && candidates.length > 0;

    return (
      <div className="flex flex-col">
        <div className={cn('flex flex-col', styles.header)}>
          <SearchBar
            autoFocus
            placeholder={t('permission.collaborators.addModal.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div
          aria-multiselectable
          className={cn('flex flex-col', styles.list)}
          role={'listbox'}
          aria-label={t(
            resourceType === 'agent'
              ? 'settingAgent.useMembers.add'
              : 'permission.collaborators.addModal.title',
          )}
        >
          {isInitialLoading ? (
            [0, 1, 2].map((key) => (
              <div className={cn('flex flex-row items-center gap-3', styles.row)} key={key}>
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="mbe-0 h-5.5 w-45 rounded-(--radius-chip)" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <SimpleEmpty
              icon={isSearchMiss ? SearchXIcon : UsersIcon}
              description={t(
                isSearchMiss
                  ? 'permission.collaborators.addModal.noMatch'
                  : resourceType === 'agent'
                    ? 'settingAgent.useMembers.empty'
                    : 'permission.collaborators.addModal.empty',
              )}
            />
          ) : (
            filtered.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                selected={selected.includes(member.userId)}
                onToggle={toggle}
              />
            ))
          )}
        </div>
        <div className={cn('flex flex-row items-center gap-2', styles.footer)}>
          <div className="flex flex-col flex-1">
            {selected.length > 0 ? (
              <div className="text-xs leading-5 text-muted-foreground">
                {t('permission.collaborators.addModal.selectedCount', { count: selected.length })}
              </div>
            ) : null}
          </div>
          <Button size="normal" type="button" variant="outline" onClick={() => close()}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button
            disabled={selected.length === 0}
            loading={mutating}
            size="normal"
            type="button"
            variant="default"
            onClick={handleConfirm}
          >
            {selected.length > 0
              ? t('permission.collaborators.addModal.confirmCount', { count: selected.length })
              : t('permission.collaborators.addModal.confirm')}
          </Button>
        </div>
      </div>
    );
  },
);

AddCollaboratorsContent.displayName = 'AddCollaboratorsContent';

export default AddCollaboratorsContent;
