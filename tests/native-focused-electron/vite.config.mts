import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type * as TypeScript from 'typescript';
import type { Plugin } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { nativeAntdNestedCjs } from './finite-antd-cjs.mts';
import desktopConfig from './product/apps/desktop/vite.renderer.config';
import { orviloUiImports } from './product/plugins/vite/orviloUiImports';

export default defineConfig(async (env) => {
  const root = process.env.ORVILO_PRODUCT_ROOT!;
  const directory = path.dirname(new URL(import.meta.url).pathname);
  const scope = process.env.ORVILO_NATIVE_SCOPE || 'next117-core';
  const scopePlan = { fixtureEntry: 'fixture.tsx', fixtureGraph: ['fixture.tsx'] };
  if (!scopePlan) throw new Error('Unplanned finite acceptance scope ' + scope);
  const sdkInstallRoot = path.resolve(
    realpathSync(path.join(root, 'node_modules/@lobehub/ui')),
    '../../..',
  );
  const rootTsconfigPath = path.join(root, 'tsconfig.json');
  const rootTsconfig = readFileSync(rootTsconfigPath, 'utf8');
  const requireRoot = createRequire(path.join(root, 'package.json'));
  const ts = requireRoot('typescript') as typeof TypeScript;
  const parsed = ts.parseConfigFileTextToJson(rootTsconfigPath, rootTsconfig);
  if (parsed.error)
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  const rootPaths = parsed.config?.compilerOptions?.paths as Record<string, string[]> | undefined;
  if (!rootPaths || JSON.stringify(rootPaths['@/*']) !== JSON.stringify(['./src/*']))
    throw new Error('Fixture app namespace must follow the real Root @/* -> ./src/* mapping');
  const pathBase = path.resolve(root, parsed.config.compilerOptions.baseUrl || '.');
  const rootTsconfigSHA256 = createHash('sha256').update(rootTsconfig).digest('hex');
  const patterns = Object.entries(rootPaths).map(([pattern, targets]) => {
    const star = pattern.indexOf('*');
    if (star >= 0 && pattern.includes('*', star + 1))
      throw new Error('Root paths must use at most one wildcard: ' + pattern);
    if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string'))
      throw new Error(
        'Root path targets must retain their declared ordered string array: ' + pattern,
      );
    return {
      pattern,
      targets,
      star,
      prefix: star < 0 ? pattern : pattern.slice(0, star),
      suffix: star < 0 ? '' : pattern.slice(star + 1),
    };
  });
  const output = process.env.ORVILO_NATIVE_OUTPUT;
  const phase = process.env.ORVILO_NATIVE_PHASE || 'renderer';
  if (output)
    writeFileSync(
      path.join(output, 'actual-fixture-tsconfig-' + phase + '.json'),
      JSON.stringify(
        {
          rootTsconfigPath,
          rootTsconfigSHA256,
          parser: 'Root installed TypeScript.parseConfigFileTextToJson',
          typeScriptVersion: ts.version,
          pathBase,
          paths: rootPaths,
          scopeBoundary:
            'Only imports authored by this external fixture directory; Root imports keep their actual installed pipeline.',
        },
        null,
        2,
      ) + '\n',
    );
  const fixtureAppSource: Plugin = {
    name: 'orvilo-acceptance-fixture-app-source',
    enforce: 'pre' as const,
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0];
        if (pathname !== '/' && pathname !== '/index.html') return next();
        try {
          const entry = '/@fs/' + path.join(directory, scopePlan.fixtureEntry).replace(/^\//, '');
          const original = readFileSync(path.join(directory, 'index.html'), 'utf8');
          const html = await server.transformIndexHtml(
            '/',
            original.replace('src="/fixture.tsx"', `src="${entry}"`),
            request.url,
          );
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
    async resolveId(source: string, importer: string | undefined, options: any) {
      if (!importer?.startsWith(directory + '/')) return null;
      // Exact patterns win; otherwise TypeScript selects the matching longest prefix.
      let matched = patterns.find((pattern) => pattern.star < 0 && source === pattern.pattern);
      if (!matched) {
        for (const pattern of patterns) {
          if (
            pattern.star < 0 ||
            source.length < pattern.prefix.length + pattern.suffix.length ||
            !source.startsWith(pattern.prefix) ||
            !source.endsWith(pattern.suffix)
          )
            continue;
          if (!matched || pattern.prefix.length > matched.prefix.length) matched = pattern;
        }
      }
      if (!matched) return null;
      const wildcard =
        matched.star < 0
          ? ''
          : source.slice(matched.prefix.length, source.length - matched.suffix.length);
      for (const target of matched.targets) {
        const candidate = path.resolve(pathBase, target.replace('*', wildcard));
        const resolved = await this.resolve(candidate, importer, { ...options, skipSelf: true });
        if (output)
          appendFileSync(
            path.join(output, 'actual-fixture-path-resolutions-' + phase + '.jsonl'),
            JSON.stringify({
              source,
              importer,
              rootTsconfigSHA256,
              pattern: matched.pattern,
              target,
              candidate,
              resolved: resolved?.id ?? null,
              skippedSelf: true,
            }) + '\n',
          );
        if (resolved) return resolved;
      }
      return null;
    },
  };
  const actual = typeof desktopConfig === 'function' ? await desktopConfig(env) : desktopConfig;
  // Same maintained public-member map used by the application's web pipeline.
  // Genuine SDK modules/contexts are preserved; only their unconsumed barrel edges are avoided.
  const memberPlugins = orviloUiImports().map((plugin: any) => {
    if (!plugin || typeof plugin !== 'object' || plugin.name !== 'orvilo-ui-named-export-proxy')
      return plugin;
    const originalResolve = plugin.resolveId;
    const originalLoad = plugin.load;
    return {
      ...plugin,
      async resolveId(this: any, ...args: any[]) {
        const result = await originalResolve.call(this, ...args);
        if (output && args[0].startsWith('virtual:orvilo-ui-named:'))
          appendFileSync(
            path.join(output, 'actual-genuine-sdk-member-resolutions.jsonl'),
            JSON.stringify({
              source: args[0],
              importer: args[1] ?? null,
              resolved: result,
              actualRootPlugin: path.join(root, 'plugins/vite/orviloUiImports.ts'),
            }) + '\n',
          );
        return result;
      },
      async load(this: any, ...args: any[]) {
        const result = await originalLoad.call(this, ...args);
        if (output && args[0].startsWith('\0virtual:orvilo-ui-named:'))
          appendFileSync(
            path.join(output, 'actual-genuine-sdk-member-forwarders.jsonl'),
            JSON.stringify({ id: args[0], code: result, preservedGenuineExport: true }) + '\n',
          );
        return result;
      },
    };
  });

  // The desktop HTML rewrite intentionally owns the application's full entry.
  // The fixture is a component acceptance surface with the same renderer pipeline.
  const plugins = actual.plugins
    ?.flat(Infinity)
    .filter(
      (plugin: any) =>
        plugin &&
        ![
          'electron-desktop-html',
          'orvilo-electron-desktop-html',
          'exclude-web-spa-build-artifacts',
          'orvilo-desktop-react-devtools',
        ].includes(plugin.name),
    );
  const merged = mergeConfig(
    { ...actual, plugins },
    {
      // Desktop namespace globs are root-absolute; keep the real app root.
      root,
      publicDir: path.join(root, 'public'),
      // Resolve the actual Desktop PostCSS owner explicitly.
      css: { postcss: root },
      cacheDir: process.env.ORVILO_NATIVE_CACHE,
      configFile: false,
      plugins: [
        fixtureAppSource,
        ...memberPlugins,
        tsconfigPaths({ projects: [path.join(root, 'tsconfig.json')] }),
      ],
      resolve: { tsconfigPaths: false },
      optimizeDeps: {
        // The production CSS leaf is not the renderer's dependency scan graph.
        entries: scopePlan.fixtureGraph.map((file: string) => path.join(directory, file)),
        holdUntilCrawlEnd: true,
        include: [
          'motion',
          'motion/react',
          'motion/react-m',
          'media-chrome/react',
          'react-hook-form',
          '@lobehub/ui/es/i18n/resources/index',
        ],
      },
      server: {
        host: '127.0.0.1',
        port: Number(process.env.ORVILO_NATIVE_PORT || 5179),
        strictPort: true,
        hmr: false,
        preTransformRequests: false,
        fs: { allow: [directory, root, sdkInstallRoot] },
      },
      build: {
        outDir: process.env.ORVILO_NATIVE_BUILD,
        emptyOutDir: true,
        rolldownOptions: { input: path.join(directory, 'css-entry.ts') },
      },
    },
  );
  // Vite mergeConfig concatenates arrays. Override only this operational optimizer
  // after the real Desktop config/plugin/alias/PostCSS merge, keeping product code untouched.
  const finiteInclude = [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-router',
    'react-router/dom',
    'i18next',
    'react-i18next',
    'react-responsive',
    ...nativeAntdNestedCjs,
    'zustand',
    'zustand/middleware',
    'swr',
    '@lobehub/ui > @emotion/react',
  ];
  const unconsumedBarrels = ['antd', '@ant-design/icons', '@lobehub/ui', '@lobehub/ui/base-ui'];
  const inheritedOptimizer = actual.optimizeDeps ?? {};
  merged.optimizeDeps = {
    ...inheritedOptimizer,
    ...merged.optimizeDeps,
    entries: [path.join(directory, 'fixture.tsx')],
    include: finiteInclude,
    exclude: [...new Set([...(inheritedOptimizer.exclude ?? []), ...unconsumedBarrels])],
    noDiscovery: false,
    holdUntilCrawlEnd: true,
  };
  if (output)
    writeFileSync(
      path.join(output, 'actual-finite-optimizer-plan.json'),
      JSON.stringify(
        {
          cause:
            'Native002 merged include arrays eagerly prebundled the whole shared renderer list and exhausted the unchanged memory guard',
          inherited: {
            entries: inheritedOptimizer.entries ?? null,
            include: inheritedOptimizer.include ?? [],
            exclude: inheritedOptimizer.exclude ?? [],
            noDiscovery: inheritedOptimizer.noDiscovery ?? false,
          },
          mergedBeforeOverride: {
            include: [
              ...(inheritedOptimizer.include ?? []),
              'motion',
              'motion/react',
              'motion/react-m',
              'media-chrome/react',
              'react-hook-form',
              '@lobehub/ui/es/i18n/resources/index',
            ],
          },
          effective: merged.optimizeDeps,
          discovery:
            'Enabled for actual finite fixture graph and on-demand CJS interop; excluded ESM UI barrels remain actual source modules, not aliases or substitutes',
          actualDesktopPluginsPostCSSAliasesProvidersPreserved: true,
          operationalAddedGenuineMemberImportPlugins: memberPlugins
            .filter(Boolean)
            .map((plugin: any) => plugin.name),
          addedPluginOwnerSHA256: createHash('sha256')
            .update(readFileSync(path.join(root, 'plugins/vite/orviloUiImports.ts')))
            .digest('hex'),
          noProviderOrCSSSubstitutions: true,
          productionCSSParityClaimed: false,
          runtimeAccepted: false,
        },
        null,
        2,
      ) + '\n',
    );
  return merged;
});
