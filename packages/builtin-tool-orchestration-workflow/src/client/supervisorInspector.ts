import type { BuiltinInspector } from '@orvilo/types';
import { useTranslation } from 'react-i18next';

import type { OrchestrationWorkflowSupervisorApiName } from '../../../builtin-tool-orchestration-workflow/src/supervisor';

const inspector = (api: keyof typeof OrchestrationWorkflowSupervisorApiName): BuiltinInspector =>
  function SupervisorInspector() {
    const { t } = useTranslation('plugin');
    return t(`builtins.orvilo-goal-supervisor.apiName.${api}`);
  };

export const OrchestrationWorkflowSupervisorInspectors = {
  inspectOrchestrationWorkflow: inspector('inspectGoal'),
  inspectTask: inspector('inspectTask'),
  readArtifact: inspector('readArtifact'),
  resolveInterruption: inspector('resolveInterruption'),
};
