import type { AgentEvalExperimentDetail, AgentEvalExperimentListItem } from '@orvilo/types';

export interface ExperimentSliceState {
  experimentDetailMap: Record<string, AgentEvalExperimentDetail>;
  experimentList: AgentEvalExperimentListItem[];
  experimentListInit: boolean;
  loadingExperimentDetailIds: string[];
}

export const experimentInitialState: ExperimentSliceState = {
  experimentDetailMap: {},
  experimentList: [],
  experimentListInit: false,
  loadingExperimentDetailIds: [],
};
