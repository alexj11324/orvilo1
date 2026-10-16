'use client';

import { Markdown } from '@lobehub/ui';
import { memo } from 'react';

/** Preserve the original requirement as archive text. */
const GoalRequirement = memo<{ goalId: string; requirement: string }>(({ requirement }) => (
  <Markdown>{requirement}</Markdown>
));

GoalRequirement.displayName = 'GoalRequirement';
export default GoalRequirement;
