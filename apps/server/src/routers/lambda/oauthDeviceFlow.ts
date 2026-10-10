import { TRPCError } from '@trpc/server';
import { DEFAULT_MODEL_PROVIDER_LIST } from 'model-bank/modelProviders';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AiProviderModel } from '@/database/models/aiProvider';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import {
  ProviderBindingPlane,
  resolveBindingManagedProviderDetail,
} from '@/database/repositories/aiInfra/providerBindings';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { parseJwtExpiry } from '@/server/services/oauthDeviceFlow';
import {
  getOAuthService,
  GithubCopilotOAuthService,
} from '@/server/services/oauthDeviceFlow/providers/githubCopilot';
import { checkProviderBindings } from '@/server/services/providerBinding/configuration';
import { createProviderBindingComposition } from '@/server/services/providerBinding/controlPlane';

const oauthProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

  // OAuth device-flow writes are personal-only (the model above has no
  // workspace scope) — they persist through the binding plane when the
  // provider is binding-managed.
  const providerBindings = new ProviderBindingPlane(ctx.serverDB, ctx.userId, {
    verifyBindings: (rows) =>
      checkProviderBindings(
        new ProviderBindingModel(ctx.serverDB, ctx.userId),
        ctx.userId,
        rows,
        createProviderBindingComposition(ctx.serverDB, { reuseProviderVerification: true }),
      ),
    workspaceId: ctx.workspaceId ?? undefined,
  });

  return opts.next({
    ctx: {
      aiProviderModel: new AiProviderModel(ctx.serverDB, ctx.userId),
      gateKeeper,
      providerBindings,
    },
  });
});
const oauthWriteProcedure = oauthProcedure.use(withScopedPermission('ai_provider:update'));

/**
 * Get OAuth Device Flow config for a provider
 */
function getOAuthConfig(providerId: string) {
  const provider = DEFAULT_MODEL_PROVIDER_LIST.find((p) => p.id === providerId);

  if (!provider?.settings?.oauthDeviceFlow) {
    return null;
  }

  return provider.settings.oauthDeviceFlow;
}

export const oauthDeviceFlowRouter = router({
  /**
   * Get current OAuth authentication status for a provider
   */
  getAuthStatus: oauthProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Personal scope prefers provider_bindings (migrated providers have no
      // ai_providers row); this router is personal-only (no workspace scope).
      const providerDetail =
        (await resolveBindingManagedProviderDetail(ctx.providerBindings, input.providerId)) ??
        (await ctx.aiProviderModel.getAiProviderById(
          input.providerId,
          KeyVaultsGateKeeper.getUserKeyVaults,
        ));

      if (!providerDetail?.keyVaults) {
        return { status: 'PENDING' };
      }

      const keyVaults = providerDetail.keyVaults as Record<string, any>;

      // Check for OAuth token
      if (keyVaults.oauthAccessToken) {
        return {
          avatarUrl: keyVaults.githubAvatarUrl as string | undefined,
          expiresAt: keyVaults.oauthTokenExpiresAt || keyVaults.bearerTokenExpiresAt,
          status: 'ACTIVE',
          username: keyVaults.githubUsername as string | undefined,
        };
      }

      return { status: 'PENDING' };
    }),

  /**
   * Initiate OAuth Device Flow - request a device code
   */
  initiateDeviceCode: oauthWriteProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ input }) => {
      const config = getOAuthConfig(input.providerId);

      if (!config) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Provider ${input.providerId} does not support OAuth Device Flow`,
        });
      }

      const service = getOAuthService(input.providerId);
      const deviceCodeResponse = await service.initiateDeviceCode(config);

      return {
        deviceCode: deviceCodeResponse.deviceCode,
        expiresIn: deviceCodeResponse.expiresIn,
        interval: deviceCodeResponse.interval,
        userCode: deviceCodeResponse.userCode,
        verificationUri: deviceCodeResponse.verificationUri,
        verificationUriComplete: deviceCodeResponse.verificationUriComplete,
      };
    }),

  /**
   * Poll for authorization status and exchange tokens if authorized
   */
  pollAuthStatus: oauthWriteProcedure
    .input(
      z.object({
        deviceCode: z.string(),
        providerId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const config = getOAuthConfig(input.providerId);

      if (!config) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Provider ${input.providerId} does not support OAuth Device Flow`,
        });
      }

      const service = getOAuthService(input.providerId);

      // For GitHub Copilot, use the specialized service
      if (input.providerId === 'githubcopilot' && service instanceof GithubCopilotOAuthService) {
        try {
          const tokens = await service.completeAuthFlow(config, input.deviceCode);

          if (!tokens) {
            // Still pending
            const pollResult = await service.pollForToken(config, input.deviceCode);
            return { status: pollResult.status };
          }

          // Save tokens and user info to keyVaults
          const tokenPatch = {
            bearerToken: tokens.bearerToken,
            bearerTokenExpiresAt: String(tokens.bearerTokenExpiresAt),
            githubAvatarUrl: tokens.userInfo.avatarUrl,
            githubUsername: tokens.userInfo.username,
            oauthAccessToken: tokens.oauthAccessToken,
          };
          const written = await ctx.providerBindings.updateProviderKeyVaults(
            input.providerId,
            tokenPatch,
          );
          if (!written) {
            await ctx.aiProviderModel.updateConfig(
              input.providerId,
              { keyVaults: tokenPatch },
              ctx.gateKeeper.encrypt,
              KeyVaultsGateKeeper.getUserKeyVaults,
            );
          }

          return { status: 'success' as const };
        } catch {
          // Probably still pending or error
          const pollResult = await service.pollForToken(config, input.deviceCode);
          return { status: pollResult.status };
        }
      }

      // Generic OAuth flow
      const pollResult = await service.pollForToken(config, input.deviceCode);

      if (pollResult.status === 'success' && pollResult.tokens) {
        // Expiry: prefer the explicit expires_in, fall back to the JWT exp
        // claim — some providers (e.g. xAI) don't always return expires_in.
        const expiresAt = pollResult.tokens.expiresIn
          ? Date.now() + pollResult.tokens.expiresIn * 1000
          : parseJwtExpiry(pollResult.tokens.accessToken);

        // Save tokens to keyVaults
        const tokenPatch = {
          oauthAccountId: pollResult.tokens.accountId,
          oauthAccessToken: pollResult.tokens.accessToken,
          oauthRefreshToken: pollResult.tokens.refreshToken,
          oauthTokenExpiresAt: expiresAt ? String(expiresAt) : undefined,
        };
        const written = await ctx.providerBindings.updateProviderKeyVaults(
          input.providerId,
          tokenPatch,
        );
        if (!written) {
          await ctx.aiProviderModel.updateConfig(
            input.providerId,
            { keyVaults: tokenPatch },
            ctx.gateKeeper.encrypt,
            KeyVaultsGateKeeper.getUserKeyVaults,
          );
        }
      }

      return { status: pollResult.status };
    }),

  /**
   * Revoke OAuth authorization for a provider
   */
  revokeAuth: oauthWriteProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Clear OAuth tokens and user info from keyVaults
      const clearPatch = {
        bearerToken: undefined,
        bearerTokenExpiresAt: undefined,
        githubAvatarUrl: undefined,
        githubUsername: undefined,
        oauthAccountId: undefined,
        oauthAccessToken: undefined,
        oauthRefreshToken: undefined,
        oauthTokenExpiresAt: undefined,
      };
      const written = await ctx.providerBindings.updateProviderKeyVaults(
        input.providerId,
        clearPatch,
      );
      if (!written) {
        await ctx.aiProviderModel.updateConfig(
          input.providerId,
          { keyVaults: clearPatch },
          ctx.gateKeeper.encrypt,
          KeyVaultsGateKeeper.getUserKeyVaults,
        );
      }

      return { success: true };
    }),
});

export type OAuthDeviceFlowRouter = typeof oauthDeviceFlowRouter;
