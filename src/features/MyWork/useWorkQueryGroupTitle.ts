import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { useCurrentProjectList, useProjectStore } from '@/store/project';

import { MY_WORK_PRIORITY_LABEL_KEYS } from './myWorkDisplay';
import { workQueryGroupTitle } from './workQueryGroupTitle';

/**
 * Resolve work-query group headers to the names already on screen elsewhere.
 * Project and member catalogs stay cached; cycles load only for the teams
 * whose ids are passed in.
 */
export const useWorkQueryGroupTitle = (input: {
  cycleTeamIds?: readonly string[];
  needsAssignee?: boolean;
  needsProject?: boolean;
}) => {
  const { i18n, t } = useTranslation(['common', 'chat']);
  useProjectStore((s) => s.useFetchProjectList)(Boolean(input.needsProject));
  const projects = useCurrentProjectList();
  const { members } = useWorkspaceMembersQuery({ enabled: Boolean(input.needsAssignee) });
  const cycleKey = [...new Set(input.cycleTeamIds ?? [])]
    .filter((id) => id.length > 0)
    .sort()
    .join('\u001F');
  const { data: cyclePages } = useClientDataSWR(
    cycleKey ? ['work-query-cycle-names', cycleKey] : null,
    () =>
      Promise.all(
        cycleKey.split('\u001F').map((teamId) => lambdaClient.team.team.query({ teamId })),
      ),
  );

  const projectName = useCallback(
    (id: string) => projects.find((project) => project.id === id)?.name || undefined,
    [projects],
  );
  const assigneeName = useCallback(
    (id: string) => {
      const member = members?.find((item) => item.userId === id);
      return member?.user?.fullName || member?.user?.username || member?.user?.email || undefined;
    },
    [members],
  );
  const cycleName = useCallback(
    (id: string) => {
      for (const page of cyclePages ?? []) {
        const cycle = page.data.cycles?.find((item) => item.id === id);
        if (cycle) return cycle.name || cycle.id;
      }
      return undefined;
    },
    [cyclePages],
  );

  return useCallback(
    (axis: string, key: string) =>
      workQueryGroupTitle(axis, key, {
        assigneeName,
        cycleName,
        labels: {
          noCycle: t('teams.noCycle'),
          noProject: t('myWork.noProject'),
          priority: (priorityKey) => {
            const label =
              MY_WORK_PRIORITY_LABEL_KEYS[Number(priorityKey)] ?? MY_WORK_PRIORITY_LABEL_KEYS[0];
            return t(`chat:${label}` as never);
          },
          today: t('time.today'),
          unassigned: t('chat:taskList.unassigned'),
          unknownDate: t('myWork.unknownDate'),
          yesterday: t('time.yesterday'),
        },
        locale: i18n.language,
        projectName,
      }),
    [assigneeName, cycleName, i18n.language, projectName, t],
  );
};
