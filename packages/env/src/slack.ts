import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const getSlackConfig = () =>
  createEnv({
    emptyStringAsUndefined: true,
    server: {
      SLACK_CLIENT_ID: z.string().optional(),
      SLACK_CLIENT_SECRET: z.string().optional(),
      SLACK_SIGNING_SECRET: z.string().optional(),
    },
    runtimeEnv: {
      SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
      SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
      SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
    },
  });
export const slackEnv = getSlackConfig();
