import { providerBindingConfigSchema } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ProviderBindingModel } from '@/database/models/providerBinding';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import {
  checkProviderBinding,
  type ProviderConfigurationComposition,
} from '@/server/services/providerBinding/configuration';
import { createProviderBindingComposition } from '@/server/services/providerBinding/controlPlane';

const version = z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict();
const procedure = authedProcedure.use(serverDatabase).use(({ ctx, next }) =>
  next({
    ctx: { providerBindings: new ProviderBindingModel(ctx.serverDB, ctx.userId) },
  }),
);
const present = (row: NonNullable<Awaited<ReturnType<ProviderBindingModel['find']>>>) => ({
  ...row.config,
  id: row.id,
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
const assertCredential = async (model: ProviderBindingModel, reference: string) => {
  if (!(await model.ownsCredentialReference(reference))) throw new TRPCError({ code: 'FORBIDDEN' });
};
const conflict = () =>
  new TRPCError({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });

export const createProviderBindingRouter = (composition?: ProviderConfigurationComposition) =>
  router({
    list: procedure.query(async ({ ctx }) => ({
      success: true,
      data: (await ctx.providerBindings.list()).map(present),
    })),
    create: procedure.input(providerBindingConfigSchema).mutation(async ({ ctx, input }) => {
      await assertCredential(ctx.providerBindings, input.secretReference);
      // A save never arms a binding: `enabled` is set only by `checkConnection`
      // after the broker verifies the row end-to-end. Forwarding a client-
      // supplied `enabled: true` would let a crafted request skip that check.
      return {
        success: true,
        data: present(await ctx.providerBindings.create({ ...input, enabled: false })),
      };
    }),
    update: procedure
      .input(version.extend({ config: providerBindingConfigSchema }))
      .mutation(async ({ ctx, input }) => {
        await assertCredential(ctx.providerBindings, input.config.secretReference);
        // Editing a binding disarms it until `checkConnection` re-verifies.
        const row = await ctx.providerBindings.update(input.id, input.revision, {
          ...input.config,
          enabled: false,
        });
        if (!row) throw conflict();
        return { success: true, data: present(row) };
      }),
    delete: procedure.input(version).mutation(async ({ ctx, input }) => {
      if (!(await ctx.providerBindings.delete(input.id, input.revision))) throw conflict();
      return { success: true };
    }),
    checkConnection: procedure.input(version).mutation(async ({ ctx, input }) => {
      return checkProviderBinding(
        ctx.providerBindings,
        ctx.userId,
        input,
        composition ?? createProviderBindingComposition(ctx.serverDB),
      );
    }),
  });

// Default composition resolves the canonical configuration broker from the
// server database — the real provider request happens inside checkBinding.
export const providerBindingRouter = createProviderBindingRouter();
