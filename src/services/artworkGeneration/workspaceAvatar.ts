import type { AgentArtworkStyle } from '@orvilo/prompts';
import { buildWorkspaceArtworkPrompt } from '@orvilo/prompts';

import { generateArtworkImage } from './generateArtworkImage';

export interface GenerateWorkspaceAvatarImageOptions {
  description?: string | null;
  id: string;
  name?: string | null;
  onGenerationCreated?: (generationId: string) => void;
  signal: AbortSignal;
  style: AgentArtworkStyle;
  /** Brand-style reference images, resolved by the calling UI layer. */
  styleReferenceImageUrls?: string[];
}

/**
 * Generates one workspace avatar and resolves with its url — the workspace
 * counterpart to the Agent artwork action. Lives here rather than in the
 * caller so that the prompt contract stays next to the generation engine.
 */
export const generateWorkspaceAvatarImage = ({
  description,
  id,
  name,
  onGenerationCreated,
  signal,
  style,
  styleReferenceImageUrls,
}: GenerateWorkspaceAvatarImageOptions): Promise<string> =>
  generateArtworkImage({
    buildPrompt: (references) =>
      buildWorkspaceArtworkPrompt({
        description,
        id,
        name,
        style,
        styleReferenceImageUrls: references.styleReferenceImageUrls,
      }),
    kind: 'avatar',
    onGenerationCreated,
    signal,
    styleReferenceImageUrls,
    topicTitle: 'Workspace avatar',
  });
