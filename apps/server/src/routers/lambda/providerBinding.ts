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
      return { success: true, data: present(await ctx.providerBindings.create(input)) };
    }),
    update: procedure
      .input(version.extend({ config: providerBindingConfigSchema }))
      .mutation(async ({ ctx, input }) => {
        await assertCredential(ctx.providerBindings, input.config.secretReference);
        const row = await ctx.providerBindings.update(input.id, input.revision, input.config);
        if (!row) throw conflict();
        return { success: true, data: present(row) };
      }),
    delete: procedure.input(version).mutation(async ({ ctx, input }) => {
      if (!(await ctx.providerBindings.delete(input.id, input.revision))) throw conflict();
      return { success: true };
    }),
    checkConnection: procedure.input(version).mutation(async ({ ctx, input }) => {
      return checkProviderBinding(ctx.providerBindings, ctx.userId, input, composition);
    }),
  });

// The default check uses the canonical broker and refuses provider network access.
// Pass an explicit composition only when it supplies a real trusted backend.
export const providerBindingRouter = createProviderBindingRouter();
