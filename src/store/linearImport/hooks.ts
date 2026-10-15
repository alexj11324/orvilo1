import { useEffect, useState } from 'react';
import useSWRInfinite from 'swr/infinite';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { augmentKey, useClientDataSWR } from '@/libs/swr';
import { linearImportKeys } from '@/libs/swr/keys';
import { linearImportService } from '@/services/linearImport';

type LinearDestinationsPage = Awaited<ReturnType<typeof linearImportService.destinations>>;
type LinearDestinationsKey =
  | ReturnType<typeof linearImportKeys.destinations>
  | readonly [...ReturnType<typeof linearImportKeys.destinations>, string];

export const useFetchLinearInstallations = (scope: string, enabled: boolean) =>
  useClientDataSWR(enabled ? linearImportKeys.installations(scope) : null, () =>
    linearImportService.installations(),
  );

export const useFetchLinearCatalog = (scope: string, installationId: string, enabled: boolean) =>
  useClientDataSWR(
    enabled && installationId ? linearImportKeys.catalog(scope, installationId) : null,
    () => linearImportService.catalog({ installationId }),
  );

export const useFetchLinearPreview = (
  scope: string,
  installationId: string,
  teamId: string,
  enabled: boolean,
) =>
  useClientDataSWR(
    enabled && installationId && teamId
      ? linearImportKeys.preview(scope, installationId, teamId)
      : null,
    () => linearImportService.preview({ installationId, teamId }),
    { revalidateOnFocus: false },
  );

export const useFetchLinearJob = (scope: string, jobId: string, enabled: boolean) =>
  useClientDataSWR(
    enabled && jobId ? linearImportKeys.job(scope, jobId) : null,
    () => linearImportService.status({ jobId }),
    {
      refreshInterval: (response) =>
        response?.data && ['queued', 'running'].includes(response.data.status) ? 3000 : 0,
    },
  );

export function useFetchLinearDestinations(scope: string, search: string, enabled: boolean) {
  const workspaceId = useActiveWorkspaceId();
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  // Infinite requests require SWR's pagination hook. Apply the same workspace key
  // augmentation as useClientDataSWR so context switches cannot share results.
  const response = useSWRInfinite<
    LinearDestinationsPage,
    Error,
    (index: number, previous: LinearDestinationsPage | null) => LinearDestinationsKey | null
  >(
    (index, previous) => {
      if (!enabled || search !== debouncedSearch) return null;
      if (index > 0 && previous?.data?.nextOffset == null) return null;
      const offset = index > 0 ? previous!.data.nextOffset! : 0;
      return augmentKey(
        linearImportKeys.destinations(scope, debouncedSearch, offset),
        workspaceId,
      ) as LinearDestinationsKey;
    },
    (key) =>
      linearImportService.destinations({
        search: debouncedSearch,
        offset: key[3],
        limit: 50,
      }),
    {
      keepPreviousData: false,
      persistSize: false,
      revalidateFirstPage: false,
      shouldRetryOnError: false,
    },
  );
  const pages = search === debouncedSearch ? response.data : undefined;
  const projects = [
    ...new Map(
      pages?.flatMap((page) => page?.data?.items ?? []).map((item) => [item.id, item]),
    ).values(),
  ];
  const nextOffset = pages?.at(-1)?.data?.nextOffset ?? null;
  return {
    ...response,
    projects,
    nextOffset,
    isLoading: response.isLoading || search !== debouncedSearch,
    loadingMore: response.isValidating && !!pages?.length,
    loadMore: () => (response.error ? response.mutate() : response.setSize(response.size + 1)),
  };
}
