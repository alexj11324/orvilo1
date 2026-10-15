'use client';

import { memo } from 'react';

import ModelConfigForm, { type ModelConfigFormHandle } from './Form';

interface CreateNewModelContentProps {
  existingModelIds?: string[];
  onFormReady: (instance: ModelConfigFormHandle | undefined) => void;
  showDeployName?: boolean;
}

const CreateNewModelContent = memo<CreateNewModelContentProps>(
  ({ showDeployName, onFormReady, existingModelIds }) => (
    <ModelConfigForm
      existingModelIds={existingModelIds}
      showDeployName={showDeployName}
      onFormInstanceReady={onFormReady}
    />
  ),
);

export default CreateNewModelContent;
