import { type SkillItem, type SkillListItem, type SkillResourceTreeNode } from '@orvilo/types';
import { produce } from 'immer';
import useSWR, { type SWRResponse } from 'swr';

import { useClientDataSWR } from '@/libs/swr';
import { toolKeys } from '@/libs/swr/keys';
import { agentSkillService } from '@/services/skill';
import { type StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import { type ToolStore } from '../../store';
import { type AgentSkillsState } from './initialState';

const n = setNamespace('agentSkills');

export interface AgentSkillDetailData {
  resourceTree: SkillResourceTreeNode[];
  skillDetail?: SkillItem;
}

type Setter = StoreSetter<ToolStore>;

export const createAgentSkillsSlice = (set: Setter, get: () => ToolStore, _api?: unknown) =>
  new AgentSkillsActionImpl(set, get, _api);

/**
 * Read side of the platform skill store.
 *
 * Creating, importing, updating and deleting platform skills is retired (see
 * `docs/development/hidden-surface-retirement.md`), so this slice is read-only.
 * It stays because the agent runtime still lists and resolves the skills the
 * user already has — `skillEngineering`, `skillPreload`, the `orvilo-skills`
 * executors and the desktop skill runtime all read from here.
 */
export class AgentSkillsActionImpl {
  readonly #set: Setter;

  constructor(set: Setter, _get: () => ToolStore, _api?: unknown) {
    void _api;
    this.#set = set;
  }

  useFetchAgentSkillDetail = (skillId?: string): SWRResponse<AgentSkillDetailData> =>
    useClientDataSWR<AgentSkillDetailData>(
      skillId ? toolKeys.agentSkillDetail(skillId) : null,
      async () => {
        const [detail, resourceTree] = await Promise.all([
          agentSkillService.getById(skillId!),
          agentSkillService.listResources(skillId!, true),
        ]);

        if (detail) {
          this.#set(
            produce((draft: AgentSkillsState) => {
              draft.agentSkillDetailMap[skillId!] = detail;
            }),
            false,
            n('useFetchAgentSkillDetail'),
          );
        }

        return { resourceTree, skillDetail: detail };
      },
      { revalidateOnFocus: false },
    );

  useFetchAgentSkills = (enabled: boolean): SWRResponse<SkillListItem[]> =>
    useSWR<SkillListItem[]>(
      enabled ? toolKeys.agentSkills() : null,
      async () => {
        const { data } = await agentSkillService.list();
        return data;
      },
      {
        onSuccess: (data) => {
          this.#set({ agentSkills: data }, false, n('useFetchAgentSkills'));
        },
        revalidateOnFocus: false,
      },
    );
}

export type AgentSkillsAction = Pick<AgentSkillsActionImpl, keyof AgentSkillsActionImpl>;
