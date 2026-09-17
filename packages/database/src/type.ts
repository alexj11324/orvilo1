import type { NeonDatabase } from 'drizzle-orm/neon-serverless';

import type * as schema from './schemas';

export type OrviloDatabaseSchema = typeof schema;

export type OrviloDatabase = NeonDatabase<OrviloDatabaseSchema>;

export type Transaction = Parameters<Parameters<OrviloDatabase['transaction']>[0]>[0];
