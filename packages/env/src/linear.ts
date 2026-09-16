import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Deployment-level fallback for Linear webhook verification. */
export const getLinearConfig = () =>
  createEnv({
    runtimeEnv: {
      LINEAR_WEBHOOK_SIGNING_SECRET: process.env.LINEAR_WEBHOOK_SIGNING_SECRET,
    },
    server: {
      LINEAR_WEBHOOK_SIGNING_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
    },
  });

export const linearEnv = getLinearConfig();
