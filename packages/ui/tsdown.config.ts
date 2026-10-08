import { defineConfig } from 'tsdown';

// Build-only entry for design-system sync. Source stays in `src/components`;
// this package only re-exports it. Dependencies stay external so the sync
// converter bundles them from node_modules.
export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  // Bundle only repo source (`@/…` alias and relative paths); every bare
  // package specifier stays external.
  external: [/^(?!@\/|\.|\/)/],
  fixedExtension: true,
  format: ['esm'],
  outDir: 'dist',
  platform: 'browser',
  target: 'es2022',
  tsconfig: './tsconfig.json',
});
