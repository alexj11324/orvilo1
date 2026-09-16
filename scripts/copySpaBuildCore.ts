import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const copyDirs = ['assets', 'devtools', 'i18n', 'model-bank', 'shiki', 'vendor'] as const;

// Workers are requested root-relative, not from under the entry prefix, because
// `new Worker` needs a same-origin script and the file is byte-identical across
// variants. So this one lands in `public/` itself rather than in each SPA
// directory — a single copy behind a single path.
const rootCopyDirs = ['app-workers'] as const;
const copyRootFilePatterns = [/^favicon.*\.ico$/, /^apple-touch-icon\.png$/] as const;
const targets = [
  { distDir: 'mobile', publicDir: 'public/_spa' },
  { distDir: 'auth', publicDir: 'public/_spa-auth' },
] as const;

/**
 * Public directories this script no longer writes, kept so the desktop
 * renderer still deletes them.
 *
 * `public/` is gitignored for these, so a checkout that built Share or
 * Workbench before they were removed still has the directories on disk.
 * `apps/desktop/vite.renderer.config.ts` prunes `dist/renderer` using
 * `spaPublicDirNames` alone, so dropping a name here would ship those stale
 * assets inside the packaged app. Removing an entry is only safe once no
 * working copy can still be carrying it.
 */
const retiredPublicDirNames = ['_spa-share', '_spa-workbench'] as const;

export const spaPublicDirNames = [
  ...new Set([
    ...targets.map(({ publicDir }) => publicDir.split('/')[1]),
    ...retiredPublicDirNames,
  ]),
];

export const copySpaBuild = (root = path.resolve(import.meta.dirname, '..')) => {
  for (const { distDir, publicDir } of targets) {
    const distRoot = path.resolve(root, `dist/${distDir}`);
    const spaDir = path.resolve(root, publicDir);
    mkdirSync(spaDir, { recursive: true });

    for (const dir of copyDirs) {
      const sourceDir = path.resolve(distRoot, dir);
      const targetDir = path.resolve(spaDir, dir);

      if (!existsSync(sourceDir)) continue;

      cpSync(sourceDir, targetDir, { recursive: true });
      console.log(`Copied dist/${distDir}/${dir} -> ${publicDir}/${dir}`);
    }

    for (const dir of rootCopyDirs) {
      const sourceDir = path.resolve(distRoot, dir);

      if (!existsSync(sourceDir)) continue;

      cpSync(sourceDir, path.resolve(root, 'public', dir), { recursive: true });
      console.log(`Copied dist/${distDir}/${dir} -> public/${dir}`);
    }

    if (!existsSync(distRoot)) continue;

    for (const file of readdirSync(distRoot)) {
      const sourceFile = path.resolve(distRoot, file);

      if (!statSync(sourceFile).isFile()) continue;
      if (!copyRootFilePatterns.some((pattern) => pattern.test(file))) continue;

      cpSync(sourceFile, path.resolve(spaDir, file));
      console.log(`Copied dist/${distDir}/${file} -> ${publicDir}/${file}`);
    }
  }
};
