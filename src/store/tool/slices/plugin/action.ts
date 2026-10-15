import { type Schema, type ValidationResult } from '@cfworker/json-schema';
import { type OrviloTool } from '@orvilo/types';
import { type SWRResponse } from 'swr';

import { useClientDataSWR } from '@/libs/swr';
import { toolKeys } from '@/libs/swr/keys';
import { pluginService } from '@/services/plugin';
import { type StoreSetter } from '@/store/types';
import { type PluginInstallError } from '@/types/tool/plugin';

import { type ToolStore } from '../../store';
import { pluginSelectors } from './selectors';

/**
 * Plugin interface
 */

type Setter = StoreSetter<ToolStore>;
export const createPluginSlice = (set: Setter, get: () => ToolStore, _api?: unknown) =>
  new PluginActionImpl(set, get, _api);

export class PluginActionImpl {
  readonly #get: () => ToolStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => ToolStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  checkPluginsIsInstalled = async (_plugins: string[]): Promise<void> => {
    // Old plugin system has been deprecated, skip auto-installation
  };

  /**
   * Refresh installed plugins from the server and update store state.
   */
  refreshPlugins = async (): Promise<void> => {
    const data = await pluginService.getInstalledPlugins();
    this.#set({ installedPlugins: data }, false, 'refreshPlugins');
  };

  updateInstallLoadingState = (id: string, loading: boolean | undefined): void => {
    this.#set(
      { pluginInstallLoading: { ...this.#get().pluginInstallLoading, [id]: loading } },
      false,
      'updateInstallLoadingState',
    );
  };

  updateInstallError = (id: string, error: PluginInstallError | undefined): void => {
    this.#set(
      { pluginInstallErrors: { ...this.#get().pluginInstallErrors, [id]: error } },
      false,
      'updateInstallError',
    );
  };

  useFetchInstalledPlugins = (enable: boolean): SWRResponse => {
    return useClientDataSWR(
      enable ? toolKeys.installedPlugins() : null,
      () => pluginService.getInstalledPlugins(),
      {
        onSuccess: (data: OrviloTool[]) => {
          this.#set(
            { installedPlugins: data, loadingInstallPlugins: false },
            false,
            'useFetchInstalledPlugins/onSuccess',
          );
        },
      },
    );
  };

  useCheckPluginsIsInstalled = (enable: boolean, plugins: string[]): SWRResponse => {
    return useClientDataSWR(enable ? plugins : null, this.#get().checkPluginsIsInstalled);
  };

  validatePluginSettings = async (identifier: string): Promise<ValidationResult | undefined> => {
    const manifest = pluginSelectors.getToolManifestById(identifier)(this.#get());
    if (!manifest || !manifest.settings) return;
    const settings = pluginSelectors.getPluginSettingsById(identifier)(this.#get());

    // validate the settings
    const { Validator } = await import('@cfworker/json-schema');
    const validator = new Validator(manifest.settings as Schema);
    const result = validator.validate(settings);

    if (!result.valid) return { errors: result.errors, valid: false };

    return { errors: [], valid: true };
  };
}

export type PluginAction = Pick<PluginActionImpl, keyof PluginActionImpl>;
