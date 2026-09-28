import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const githubAppEnv = createEnv({
  runtimeEnv: {
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
  },
  server: {
    GITHUB_APP_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
    GITHUB_APP_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  },
});
