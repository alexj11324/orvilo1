import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import type { DescriptionReference } from '@/libs/editor/descriptionReference';
import { useClientDataSWR } from '@/libs/swr';
import {
  type DescriptionReferenceMetadata,
  resolveDescriptionReference,
} from '@/services/descriptionReference';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

export const useFetchDescriptionReference = (
  reference: DescriptionReference | null,
  appOrigin: string,
) => {
  const userId = useUserStore(userProfileSelectors.userId);
  const workspaceSlug = useActiveWorkspaceSlug();
  return useClientDataSWR<DescriptionReferenceMetadata>(
    reference && userId
      ? ['description:reference', userId, reference.kind, reference.id, reference.url]
      : null,
    () => resolveDescriptionReference(reference, appOrigin, workspaceSlug ?? undefined),
    { dedupingInterval: 30_000, shouldRetryOnError: false },
  );
};
