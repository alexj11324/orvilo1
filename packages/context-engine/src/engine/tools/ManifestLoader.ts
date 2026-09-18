import type { OrviloToolManifest } from './types';

/**
 * Interface for loading tool manifests on demand.
 *
 * Used when step-level tool activations reference tools not present in
 * the operation-level manifest map. Implementations can fetch manifests
 * from databases, market services, or other sources.
 */
export interface ManifestLoader {
  loadManifest: (toolId: string) => Promise<OrviloToolManifest | undefined>;
  loadManifests: (toolIds: string[]) => Promise<Record<string, OrviloToolManifest>>;
}
