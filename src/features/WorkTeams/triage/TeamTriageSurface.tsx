'use client';
import { toast } from '@lobehub/ui/base-ui';
import type { TeamTriageAction } from '@orvilo/types';
import { ListChecksIcon, PlusIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import MarkDuplicateModal from '../MarkDuplicateModal';
import { teamSurfaceState } from '../teamSurfaceState';
import { teamTriageCreateOptions } from '../teamTriageCreate';
import TeamTriageRow from './TeamTriageRow';
import {
  buildTriageMutationInput,
  resolveTriageCreator,
  type TeamTriageMemberProfile,
  type TeamTriageMutationExtras,
  type TeamTriageTask,
  triageAssigneeOptions,
} from './teamTriageRowModel';

interface TeamTriageSurfaceProps {
  /** Other teams the ⋯ "Move to team" submenu can target. */
  destinations: Array<{ label: string; value: string }>;
  error?: unknown;
  isLoading: boolean;
  /** Team members — the only legal reassign targets (server enforced). */
  members: ReadonlyArray<{ userId: string }>;
  /** Post-write refresh — the shell revalidates triage and issues surfaces. */
  onChanged: () => void;
  onRetry: () => void;
  tasks: TeamTriageTask[];
  teamId: string;
}

/**
 * The whole `?tab=triage` body: error / loading / empty / populated states,
 * per-row triage dispatch (accept, decline, duplicate, reassign), the
 * mark-duplicate modal, and the create-triage-issue CTA. Chrome-level gating
 * (`triageCapable`, tab routing, page header) stays in the team page shell.
 */
const TeamTriageSurface = memo<TeamTriageSurfaceProps>(
  ({ destinations, error, isLoading, members, onChanged, onRetry, tasks, teamId }) => {
    const { t } = useTranslation('common');
    const [duplicateTaskId, setDuplicateTaskId] = useState<string | null>(null);
    const membersQuery = useWorkspaceMembersQuery({ enabled: true });

    // Creator chips and reassign labels resolve through the workspace member
    // directory; the triage task rows only carry `createdByUserId` + a display
    // snapshot.
    const profiles = useMemo<ReadonlyMap<string, TeamTriageMemberProfile>>(
      () =>
        new Map(
          (membersQuery.members ?? []).map((member) => [
            member.userId,
            {
              avatar: member.user?.avatar,
              name: member.user?.fullName || member.user?.username || member.user?.email,
            },
          ]),
        ),
      [membersQuery.members],
    );

    const act = useCallback(
      async (
        task: TeamTriageTask,
        action: TeamTriageAction,
        extras: TeamTriageMutationExtras = {},
      ) => {
        const input = buildTriageMutationInput(task, teamId, action, extras);
        if (!input) return;
        try {
          await workAttentionService.triage(input);
          onChanged();
          toast.success(t('teams.triageUpdated'));
        } catch (error) {
          toast.error(
            isTrpcErrorCode(error, 'CONFLICT')
              ? t('teams.transferConflict')
              : t('teams.triageFailed'),
          );
        }
      },
      [onChanged, t, teamId],
    );

    const openComposer = useCallback(() => {
      createTaskModal(teamTriageCreateOptions(teamId, onChanged));
    }, [onChanged, teamId]);

    const state = teamSurfaceState({ error, isLoading, itemCount: tasks.length });

    return (
      <>
        {state === 'error' ? (
          <AsyncError error={error} onRetry={onRetry} />
        ) : state === 'loading' ? (
          <div aria-busy aria-label={t('teams.loading')} className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-10 w-full" key={index} />
            ))}
          </div>
        ) : state === 'empty' ? (
          <div className="flex flex-col items-center justify-center gap-3 flex-1 p-12">
            <div className="flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              <ListChecksIcon aria-hidden className="size-8" />
              <p>{t('teams.triageEmpty')}</p>
            </div>
            <Button variant="outline" onClick={openComposer}>
              <PlusIcon aria-hidden className="size-4" />
              {t('teams.triageCreate')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 2 }}>
            {tasks.map((task) => (
              <TeamTriageRow
                creator={resolveTriageCreator(task, profiles)}
                destinations={destinations}
                key={task.id}
                memberOptions={triageAssigneeOptions(members, profiles, task.assigneeUserId)}
                task={task}
                onAction={(action) => void act(task, action)}
                onPickDuplicate={setDuplicateTaskId}
                onReassign={(id, assigneeUserId) => void act(task, 'reassign', { assigneeUserId })}
                onTransferred={onChanged}
              />
            ))}
          </div>
        )}
        <MarkDuplicateModal
          open={duplicateTaskId !== null}
          taskId={duplicateTaskId}
          onClose={() => setDuplicateTaskId(null)}
          onConfirm={(id, canonicalTaskId) => {
            const task = tasks.find((row) => row.id === id);
            if (task) void act(task, 'duplicate', { canonicalTaskId });
          }}
        />
      </>
    );
  },
);

TeamTriageSurface.displayName = 'TeamTriageSurface';

export default TeamTriageSurface;
