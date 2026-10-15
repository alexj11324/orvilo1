import type { ComponentProps } from 'react';

import { Badge } from '@/components/reui/badge';

import ModelIcon from '../../../../packages/brand-icons/src/features/ModelIcon';

export interface ModelTagProps extends Omit<ComponentProps<typeof Badge>, 'children'> {
  model: string;
  type?: 'color' | 'mono';
}
const ModelTag = ({ model, type = 'mono', ...props }: ModelTagProps) => (
  <Badge variant="secondary" {...props}>
    <ModelIcon model={model} type={type} />
    {model}
  </Badge>
);
export default ModelTag;
