import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const readEntry = () => readFile(path.join(process.cwd(), 'src/spa/entry.mobile.tsx'), 'utf8');

describe('mobile entry boot order', () => {
  // The mobile bundle mounts the same shared components (composer, settings,
  // workspace surfaces) that style themselves with Tailwind utilities. Web and
  // desktop import `globals.css` for those utilities; when the mobile entry
  // skipped the import, every `flex`/`*-row` className silently resolved to
  // block layout and shared chrome (e.g. the composer card) overflowed its
  // borders — no test failed because the DOM still rendered.
  it('imports globals.css so Tailwind utilities resolve', async () => {
    const source = await readEntry();

    expect(source).toContain(`import '@/app/globals.css'`);
  });
});
