import type { RouterRuntimeRequestContext } from '@orvilo/types';

interface RouterInstance {
  apiType: string;
  models?: string[];
  options: {
    accessKeyId?: string;
    accessKeySecret?: string;
    apiKey?: string;
    apiVersion?: string;
    baseURL?: string;
    baseURLOrAccountID?: string;
    dangerouslyAllowBrowser?: boolean;
    region?: string;
    sessionToken?: string;
  };
}

interface OrviloRouterRuntimeOptions {
  id: string;
  routers: (options: any, runtimeContext: RouterRuntimeRequestContext) => Promise<RouterInstance[]>;
}

export const orviloRouterRuntimeOptions: OrviloRouterRuntimeOptions = {
  id: 'orvilo',

  routers: async (_options, { model: _model }) => {
    return [];
  },
};
