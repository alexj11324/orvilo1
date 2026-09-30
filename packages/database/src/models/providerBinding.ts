import { type ProviderBindingConfig, providerBindingConfigSchema } from '@orvilo/types';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { credentials } from '../schemas/credential';
import { providerBindings } from '../schemas/providerBinding';
import type { OrviloDatabase } from '../type';

export class ProviderBindingModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
  ) {}

  list = () =>
    this.db
      .select()
      .from(providerBindings)
      .where(eq(providerBindings.userId, this.userId))
      .orderBy(desc(providerBindings.updatedAt));

  find = async (id: string) =>
    (
      await this.db
        .select()
        .from(providerBindings)
        .where(and(eq(providerBindings.id, id), eq(providerBindings.userId, this.userId)))
    )[0];

  ownsCredentialReference = async (reference: string) => {
    const [row] = await this.db
      .select({ id: credentials.id })
      .from(credentials)
      .where(
        and(
          eq(credentials.id, reference.slice('credential:'.length)),
          eq(credentials.ownerUserId, this.userId),
          isNull(credentials.workspaceId),
        ),
      );
    return Boolean(row);
  };

  create = async (config: ProviderBindingConfig) =>
    (
      await this.db
        .insert(providerBindings)
        .values({ config: providerBindingConfigSchema.parse(config), userId: this.userId })
        .returning()
    )[0];

  update = async (id: string, revision: number, config: ProviderBindingConfig) =>
    (
      await this.db
        .update(providerBindings)
        .set({
          config: providerBindingConfigSchema.parse(config),
          revision: sql`${providerBindings.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(providerBindings.userId, this.userId),
            eq(providerBindings.id, id),
            eq(providerBindings.revision, revision),
          ),
        )
        .returning()
    )[0];

  delete = async (id: string, revision: number) =>
    (
      await this.db
        .delete(providerBindings)
        .where(
          and(
            eq(providerBindings.userId, this.userId),
            eq(providerBindings.id, id),
            eq(providerBindings.revision, revision),
          ),
        )
        .returning({ id: providerBindings.id })
    )[0];
}
