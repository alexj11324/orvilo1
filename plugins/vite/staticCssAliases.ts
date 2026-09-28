import type { Plugin } from 'vite';

const SOURCE_PREFIX = 'virtual:aspectlylabs/';
const TARGET_PREFIX = 'virtual:lobehub/';

// `lobeStaticCssPlugin` registers `virtual:lobehub/*` module ids while app code
// imports them under the rebranded `virtual:aspectlylabs/*` spelling. Re-resolve
// through the normal pipeline so the plugin's own hooks handle the module.
export const staticCssAliases = (): Plugin => ({
  enforce: 'pre',
  name: 'orvilo-static-css-aliases',
  resolveId(source, importer, options) {
    if (!source.startsWith(SOURCE_PREFIX)) return null;
    return this.resolve(source.replace(SOURCE_PREFIX, TARGET_PREFIX), importer, {
      ...options,
      skipSelf: true,
    });
  },
});
