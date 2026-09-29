import { cfReactRouterManifestBridge } from '../../plugins/vite/cfReactRouterManifestBridge';
import rrConfig from './vite.config.rr.mts';

export default {
  ...rrConfig,
  plugins: [...(rrConfig.plugins ?? []), cfReactRouterManifestBridge(import.meta.dirname)],
};
