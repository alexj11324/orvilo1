import { TRPCError } from '@trpc/server';
import { serialize } from 'cookie';
import debug from 'debug';
import { z } from 'zod';

import { publicProcedure, router } from '@/libs/trpc/lambda';
import { marketUserInfo, serverDatabase } from '@/libs/trpc/lambda/middleware';
import { DiscoverService } from '@/server/services/discover';
import { MarketService } from '@/server/services/market';
import { AssistantSorts, McpConnectionType, McpSorts } from '@/types/discover';

import { agentRouter } from './agent';
import { credsRouter } from './creds';
import { oidcRouter } from './oidc';
import { userRouter } from './user';

const log = debug('lambda-router:market');

const marketSourceSchema = z.enum(['legacy', 'new']);

// Public procedure with optional user info for trusted client token
const marketProcedure = publicProcedure
  .use(serverDatabase)
  .use(marketUserInfo)
  .use(async ({ ctx, next }) => {
    return next({
      ctx: {
        discoverService: new DiscoverService({
          accessToken: ctx.marketAccessToken,
          userInfo: ctx.marketUserInfo,
        }),
        marketService: new MarketService({
          accessToken: ctx.marketAccessToken,
          userInfo: ctx.marketUserInfo,
        }),
      },
    });
  });

export const marketRouter = router({
  // ============================== Agent Management (authenticated) ==============================
  agent: agentRouter,

  // ============================== Credential Management ==============================
  creds: credsRouter,

  // ============================== Catalog reads feeding live builtin-tool + install flows ==============================
  getAgentsByPlugin: marketProcedure
    .input(
      z.object({
        locale: z.string().optional(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
        pluginId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      log('getAgentsByPlugin input: %O', input);

      try {
        return await ctx.discoverService.getAgentsByPlugin(input);
      } catch (error) {
        log('Error fetching agents by plugin: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch agents by plugin',
        });
      }
    }),

  getAssistantDetail: marketProcedure
    .input(
      z.object({
        identifier: z.string(),
        locale: z.string().optional(),
        source: marketSourceSchema.optional(),
        version: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      log('getAssistantDetail input: %O', input);

      try {
        return await ctx.discoverService.getAssistantDetail(input);
      } catch (error) {
        log('Error fetching assistants detail: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch assistants detail',
        });
      }
    }),

  getAssistantList: marketProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          connectionType: z.nativeEnum(McpConnectionType).optional(),
          includeAgentGroup: z.boolean().optional(),
          includeCategoryCounts: z.boolean().optional(),
          locale: z.string().optional(),
          order: z.enum(['asc', 'desc']).optional(),
          ownerId: z.string().optional(),
          page: z.number().optional(),
          pageSize: z.number().optional(),
          q: z.string().optional(),
          sort: z.nativeEnum(AssistantSorts).optional(),
          source: marketSourceSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      log('getAssistantList input: %O', input);

      try {
        return await ctx.discoverService.getAssistantList(input);
      } catch (error) {
        log('Error fetching assistant list: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch assistant list',
        });
      }
    }),

  getMcpDetail: marketProcedure
    .input(
      z.object({
        identifier: z.string(),
        locale: z.string().optional(),
        version: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      log('getMcpDetail input: %O', input);

      try {
        return await ctx.discoverService.getMcpDetail(input);
      } catch (error) {
        console.error('Error fetching mcp detail: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch mcp detail',
        });
      }
    }),

  getMcpList: marketProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          connectionType: z.nativeEnum(McpConnectionType).optional(),
          locale: z.string().optional(),
          order: z.enum(['asc', 'desc']).optional(),
          page: z.number().optional(),
          pageSize: z.number().optional(),
          q: z.string().optional(),
          sort: z.nativeEnum(McpSorts).optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      log('getMcpList input: %O', input);

      try {
        return await ctx.discoverService.getMcpList(input);
      } catch (error) {
        log('Error fetching mcp list: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch mcp list',
        });
      }
    }),

  getMcpManifest: marketProcedure
    .input(
      z.object({
        identifier: z.string(),
        install: z.boolean().optional(),
        locale: z.string().optional(),
        version: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      log('getMcpManifest input: %O', input);

      try {
        return await ctx.discoverService.getMcpManifest(input);
      } catch (error) {
        log('Error fetching mcp manifest: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch mcp manifest',
        });
      }
    }),

  getPluginDetail: marketProcedure
    .input(
      z.object({
        identifier: z.string(),
        locale: z.string().optional(),
        withManifest: z.boolean().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      log('getPluginDetail input: %O', input);

      try {
        return await ctx.discoverService.getPluginDetail(input);
      } catch (error) {
        log('Error fetching plugin details: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch plugin details',
        });
      }
    }),

  // ============================== OIDC Authentication ==============================
  oidc: oidcRouter,

  registerClientInMarketplace: marketProcedure.input(z.object({})).mutation(async ({ ctx }) => {
    return ctx.discoverService.registerClient({
      userAgent: ctx.userAgent,
    });
  }),

  registerM2MToken: marketProcedure
    .input(
      z.object({
        clientId: z.string(),
        clientSecret: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      log('registerM2MToken input: %O', { clientId: input.clientId, clientSecret: '[HIDDEN]' });

      try {
        const { accessToken, expiresIn } = await ctx.discoverService.fetchM2MToken(input);

        // check accessToken
        if (!accessToken) {
          // clean Cookies

          ctx.resHeaders?.append('Set-Cookie', serialize('mp_token_status', '', { maxAge: -1 }));
          ctx.resHeaders?.append('Set-Cookie', serialize('mp_token', '', { maxAge: -1 }));

          return { success: false };
        }

        log('get access token, expiresIn value:', expiresIn);
        log('expiresIn type:', typeof expiresIn);

        const expirationTime = new Date(Date.now() + (expiresIn - 60) * 1000); // Expire 60 seconds early

        log('expirationTime:', expirationTime.toISOString());

        // Set HTTP-Only Cookie to store the actual access token
        const tokenCookie = serialize('mp_token', accessToken, {
          expires: expirationTime,
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });

        // Set client-readable status marker cookie (without actual token)
        const statusCookie = serialize('mp_token_status', 'active', {
          expires: expirationTime,
          httpOnly: false,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });

        // Set Set-Cookie header via context's resHeaders
        ctx.resHeaders?.append('Set-Cookie', tokenCookie);
        ctx.resHeaders?.append('Set-Cookie', statusCookie);

        return {
          expiresIn: expiresIn - 60,
          success: true,
        };
      } catch (error) {
        console.error('Error fetching M2M token: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch M2M token',
        });
      }
    }),

  submitFeedback: marketProcedure
    .input(
      z.object({
        clientInfo: z
          .object({
            language: z.string().optional(),
            timezone: z.string().optional(),
            url: z.string().optional(),
            userAgent: z.string().optional(),
          })
          .optional(),
        email: z.string().optional(),
        message: z.string(),
        screenshotUrl: z.string().optional(),
        title: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      log('submitFeedback input: %O', input);

      try {
        const result = await ctx.marketService.submitFeedback(input);
        return { issueUrl: result?.issueUrl, success: true };
      } catch (error) {
        console.error('Error submitting feedback: %O', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to submit feedback',
        });
      }
    }),

  // ============================== User Profile ==============================
  user: userRouter,
});
