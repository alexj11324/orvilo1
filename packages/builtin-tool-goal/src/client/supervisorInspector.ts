import type { BuiltinInspector } from '@orvilo/types';
import { useTranslation } from 'react-i18next';

import type { GoalSupervisorApiName } from '../supervisor';

const inspector = (api: keyof typeof GoalSupervisorApiName): BuiltinInspector =>
  function SupervisorInspector() {
    const { t } = useTranslation('plugin');
    return t(`builtins.orvilo-goal-supervisor.apiName.${api}`);
  };

export const GoalSupervisorInspectors = {
  inspectGoal: inspector('inspectGoal'),
  inspectTask: inspector('inspectTask'),
  readArtifact: inspector('readArtifact'),
  resolveInterruption: inspector('resolveInterruption'),
};
