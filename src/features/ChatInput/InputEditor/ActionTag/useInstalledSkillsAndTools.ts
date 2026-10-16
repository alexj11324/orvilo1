import isEqual from 'fast-deep-equal';
import { useMemo } from 'react';

import { useToolStore } from '@/store/tool';
import { builtinToolSelectors } from '@/store/tool/selectors';

import type { ActionTagData } from './types';

/** Native filesystem and Agent document skills are provided by useSlashActionItems separately. */
export const useInstalledSkillsAndTools = (): ActionTagData[] => {
  const builtinSkills = useToolStore(builtinToolSelectors.installedBuiltinSkills, isEqual);
  const builtinTools = useToolStore(builtinToolSelectors.metaList, isEqual);

  return useMemo(
    () => [
      ...builtinSkills.map((skill): ActionTagData => ({
        category: 'skill',
        description: skill.description,
        icon: skill.avatar,
        label: skill.title || skill.name || skill.identifier,
        type: skill.identifier,
      })),
      ...builtinTools
        .filter((tool) => !builtinSkills.some((skill) => skill.identifier === tool.identifier))
        .map((tool): ActionTagData => ({
          category: 'tool',
          description: tool.meta.description,
          icon: tool.meta.avatar,
          label: tool.meta.title || tool.identifier,
          type: tool.identifier,
        })),
    ],
    [builtinSkills, builtinTools],
  );
};
