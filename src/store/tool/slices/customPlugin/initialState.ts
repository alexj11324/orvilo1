import { type OrviloToolCustomPlugin } from '@/types/tool/plugin';

export interface CustomPluginState {
  customPluginSearchKeywords?: string;
  newCustomPlugin: Partial<OrviloToolCustomPlugin>;
}
export const defaultCustomPlugin: Partial<OrviloToolCustomPlugin> = {
  customParams: {
    apiMode: 'simple',
    enableSettings: false,
    manifestMode: 'url',
  },
  type: 'customPlugin',
};

export const initialCustomPluginState: CustomPluginState = {
  customPluginSearchKeywords: '',
  newCustomPlugin: defaultCustomPlugin,
};
