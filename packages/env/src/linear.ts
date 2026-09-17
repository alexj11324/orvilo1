import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Deployment-level fallback for Linear webhook verification. */
export const getLinearConfig = () =>
  createEnv({
    runtimeEnv: {
      LINEAR_OAUTH_CLIENT_ID: process.env.LINEAR_OAUTH_CLIENT_ID,
      LINEAR_OAUTH_CLIENT_SECRET: process.env.LINEAR_OAUTH_CLIENT_SECRET,
      LINEAR_OAUTH_SCOPES: process.env.LINEAR_OAUTH_SCOPES,
      LINEAR_WEBHOOK_SIGNING_SECRET: process.env.LINEAR_WEBHOOK_SIGNING_SECRET,
    },
    server: {
      LINEAR_OAUTH_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
      LINEAR_OAUTH_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
      LINEAR_OAUTH_SCOPES: z.preprocess(emptyStringToUndefined, z.string().optional()),
      LINEAR_WEBHOOK_SIGNING_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
    },
  });

export const linearEnv = getLinearConfig();
