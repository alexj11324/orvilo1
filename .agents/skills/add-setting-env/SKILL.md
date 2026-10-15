---
name: add-setting-env
description: Add server-side environment variables that control default values for user settings.
disable-model-invocation: true
argument-hint: '[setting-name]'
---

# Adding Environment Variable for User Settings

Add server-side environment variables to configure default values for user settings.

**Priority**: User Custom > Server Env Var > Hardcoded Default

## Steps

### 1. Define Environment Variable

Create `packages/env/src/<domain>.ts` (import path stays `@/envs/<domain>` — tsconfig maps to `packages/env/src/*` first):

```typescript
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const get<Domain>Config = () => {
  return createEnv({
    server: {
      YOUR_ENV_VAR: z.coerce.number().min(MIN).max(MAX).optional(),
    },
    runtimeEnv: {
      YOUR_ENV_VAR: process.env.YOUR_ENV_VAR,
    },
  });
};

export const <domain>Env = get<Domain>Config();
```

### 2. Update Type (if new domain)

Add to `packages/types/src/serverConfig.ts`:

```typescript
import { User<Domain>Config } from './user/settings';

export interface GlobalServerConfig {
  <domain>?: PartialDeep<User<Domain>Config>;
}
```

**Prefer reusing existing types** from `packages/types/src/user/settings`.

### 3. Assemble Server Config (if new domain)

In `apps/server/src/globalConfig/index.ts`:

```typescript
import { <domain>Env } from '@/envs/<domain>';

export const getServerGlobalConfig = async () => {
  const config: GlobalServerConfig = {
    <domain>: cleanObject({
      <settingName>: <domain>Env.YOUR_ENV_VAR,
    }),
  };
  return config;
};
```

### 4. Merge to User Store (if new domain)

In `src/store/user/slices/common/action.ts`:

```typescript
const serverSettings: PartialDeep<UserSettings> = {
  <domain>: serverConfig.<domain>,
};
```

### 5. Update .env.example

```bash
# <Description> (range/options, default: X)
# YOUR_ENV_VAR=<example>
```

### 6. Update Documentation

- `docs/self-hosting/environment-variables/basic.mdx` (EN)
- `docs/self-hosting/environment-variables/basic.zh-CN.mdx` (CN)

## Current configuration example

Use `packages/env/src/auth.ts` and
`apps/server/src/globalConfig/getServerAuthConfig.ts` to follow the existing
`AUTH_DISABLE_EMAIL_PASSWORD` → `disableEmailPassword` configuration path.
The former image-default setting and `packages/env/src/image.ts` were removed;
do not recreate them to follow an old example. A new user-setting default must
first have an active consumer and a matching user-settings type.
