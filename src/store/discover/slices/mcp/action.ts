import { type SWRResponse } from 'swr';

import { useClientDataSWR } from '@/libs/swr';
import { discoverKeys } from '@/libs/swr/keys';
import { discoverService } from '@/services/discover';
import { type DiscoverStore } from '@/store/discover';
import { globalHelpers } from '@/store/global/helpers';
import { type StoreSetter } from '@/store/types';
import { type DiscoverMcpDetail } from '@/types/discover';

type Setter = StoreSetter<DiscoverStore>;
export const createMCPSlice = (set: Setter, get: () => DiscoverStore, _api?: unknown) =>
  new MCPActionImpl(set, get, _api);

export class MCPActionImpl {
  constructor(set: Setter, get: () => DiscoverStore, _api?: unknown) {
    void _api;
    void set;
    void get;
  }

  useFetchMcpDetail = ({
    identifier,
    version,
  }: {
    identifier?: string;
    version?: string;
  }): SWRResponse<DiscoverMcpDetail> => {
    const locale = globalHelpers.getCurrentLanguage();

    return useClientDataSWR(
      !identifier ? null : discoverKeys.mcpDetail(locale, identifier, version),
      async () => discoverService.getMcpDetail({ identifier: identifier!, version }),
    );
  };
}

export type MCPAction = Pick<MCPActionImpl, keyof MCPActionImpl>;
