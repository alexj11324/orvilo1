export { default as ArtworkStudioContent, type ArtworkStudioContentProps } from './Content';
export {
  ORVILO_STYLE_REFERENCE_IMAGE_URLS,
  styleReferencesForArtworkStyle,
} from './styleReferences';
// Re-exported so a surface can render the studio without taking a direct
// dependency on `@orvilo/prompts`.
export type { AgentArtworkStyle } from '@orvilo/prompts';
