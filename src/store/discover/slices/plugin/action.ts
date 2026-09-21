import { type DiscoverPluginDetail } from '@orvilo/types';
import { type SWRResponse } from 'swr';
import useSWR from 'swr';

import { discoverKeys } from '@/libs/swr/keys';
import { discoverService } from '@/services/discover';
import { type DiscoverStore } from '@/store/discover';
import { globalHelpers } from '@/store/global/helpers';
import { type StoreSetter } from '@/store/types';

type Setter = StoreSetter<DiscoverStore>;
export const createPluginSlice = (set: Setter, get: () => DiscoverStore, _api?: unknown) =>
  new PluginActionImpl(set, get, _api);

export class PluginActionImpl {
  constructor(set: Setter, get: () => DiscoverStore, _api?: unknown) {
    void _api;
    void set;
    void get;
  }

  usePluginDetail = ({
    identifier,
    withManifest,
  }: {
    identifier?: string;
    withManifest?: boolean;
  }): SWRResponse<DiscoverPluginDetail | undefined> => {
    const locale = globalHelpers.getCurrentLanguage();
    return useSWR(
      !identifier ? null : discoverKeys.pluginDetail(locale, identifier, withManifest),
      async () => discoverService.getPluginDetail({ identifier: identifier!, withManifest }),
      {
        revalidateOnFocus: false,
      },
    );
  };
}

export type PluginAction = Pick<PluginActionImpl, keyof PluginActionImpl>;
