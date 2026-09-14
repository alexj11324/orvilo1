import { type BuiltinSkill } from '@orvilo/types';

import { systemPrompt } from './content';
import { ArtifactsIdentifier, ArtifactsManifest } from './manifest';

export { ArtifactsIdentifier };

export const ArtifactsSkill: BuiltinSkill = {
  ...ArtifactsManifest,
  content: systemPrompt,
};
