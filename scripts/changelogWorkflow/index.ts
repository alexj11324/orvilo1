import { consola } from 'consola';

import { buildStaticChangelog } from './buildStaticChangelog';

const run = () => {
  consola.start('Building static changelog...');
  const replaceVersion = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--replace-version='))
    ?.slice('--replace-version='.length);
  buildStaticChangelog.run(replaceVersion);
};

run();
