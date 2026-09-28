import debug from 'debug';
import { type NextRequest, NextResponse } from 'next/server';

import { LinearSyncModel } from '@/database/models/linearSync';
import { serverDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import {
  exchangeLinearAuthorizationCode,
  getLinearOAuthConfig,
  normalizeLinearScopes,
  validateLinearOAuthInstallation,
} from '@/server/services/linearSync/oauth';
import { consumeLinearOAuthState } from '@/server/services/linearSync/oauthState';
import { hasWorkspaceScopedPermission } from '@/server/services/workspacePermission';

const log = debug('orvilo-server:linear:oauth-callback');

const jsonForScript = (value: unknown): string =>
  JSON.stringify(value).replaceAll(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );

const targetOrigin = (request: NextRequest): string => {
  try {
    if (appEnv.APP_URL) return new URL(appEnv.APP_URL).origin;
  } catch {
    // fall through to the request origin
  }
  // Same-origin fallback — never broadcast the result to '*'.
  return request.nextUrl.origin;
};

const renderResultPage = (
  request: NextRequest,
  result: {
    error?: string;
    installationId?: string;
    success: boolean;
  },
): NextResponse => {
  const payload = jsonForScript({ type: 'orvilo-linear-oauth', ...result });
  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Linear installation</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; text-align: center;">
    <p>${result.success ? 'Linear installation complete. You can close this window.' : 'Linear installation failed.'}</p>
    <script>
      (function () {
        try {
          if (window.opener) window.opener.postMessage(${payload}, ${jsonForScript(targetOrigin(request))});
        } catch (error) {}
        setTimeout(function () { window.close(); }, 300);
      })();
    </script>
  </body>
</html>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};

export const GET = async (request: NextRequest) => {
  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const providerError = request.nextUrl.searchParams.get('error');

  if (!state) return renderResultPage(request, { error: 'missing_state', success: false });
  const statePayload = await consumeLinearOAuthState(state);
  if (!statePayload)
    return renderResultPage(request, { error: 'invalid_or_expired_state', success: false });

  // OAuth state is short-lived, but the installer’s authorization can change
  // while Linear’s consent screen is open. Re-check the live workspace grant
  // before exchanging or persisting any provider credential.
  const hasCurrentWorkspaceSettingsPermission = () =>
    hasWorkspaceScopedPermission({
      action: 'WORKSPACE_SETTINGS_UPDATE',
      db: serverDB,
      scopes: ['ALL'],
      userId: statePayload.lobeUserId,
      workspaceId: statePayload.workspaceId,
    });
  const canManageInstallation = await hasCurrentWorkspaceSettingsPermission();
  if (!canManageInstallation) {
    return renderResultPage(request, { error: 'workspace_access_denied', success: false });
  }

  if (providerError)
    return renderResultPage(request, { error: 'authorization_denied', success: false });
  if (!code) return renderResultPage(request, { error: 'missing_code', success: false });

  try {
    const config = getLinearOAuthConfig();
    if (statePayload.clientId !== config.clientId || statePayload.actor !== 'app') {
      return renderResultPage(request, { error: 'invalid_oauth_configuration', success: false });
    }

    const tokens = await exchangeLinearAuthorizationCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      codeVerifier: statePayload.codeVerifier,
      redirectUri: statePayload.redirectUri,
    });
    if (!tokens.refresh_token) {
      return renderResultPage(request, { error: 'missing_refresh_token', success: false });
    }

    // Both the organization and the app actor come from Linear's API. Nothing
    // in the browser callback can choose an organization to install into.
    const identity = await validateLinearOAuthInstallation({
      accessToken: tokens.access_token,
    });
    const scopes = normalizeLinearScopes(tokens.scope, statePayload.scopes);
    if (!scopes.includes('read') || !scopes.includes('write')) {
      return renderResultPage(request, { error: 'insufficient_scope', success: false });
    }
    if (!(await hasCurrentWorkspaceSettingsPermission())) {
      return renderResultPage(request, { error: 'workspace_access_denied', success: false });
    }

    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    const model = new LinearSyncModel(serverDB, statePayload.workspaceId);
    const installation = await model.upsertOAuthInstallation({
      accessTokenCiphertext: await gateKeeper.encrypt(tokens.access_token),
      accessTokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      appActorId: identity.appActorId,
      appActorName: identity.appActorName,
      installedByUserId: statePayload.lobeUserId,
      oauthClientId: config.clientId,
      organizationId: identity.organizationId,
      organizationName: identity.organizationName,
      refreshTokenCiphertext: await gateKeeper.encrypt(tokens.refresh_token),
      scopes,
    });
    // The workspace sync scope exists from the moment the installation lands;
    // mirroring still waits for the approved team/project intent delivered
    // through `upsertSyncScope`.
    await model.upsertScope({ installationId: installation.id });

    return renderResultPage(request, { installationId: installation.id, success: true });
  } catch (error) {
    log('Linear OAuth callback failed: %O', error);
    return renderResultPage(request, { error: 'installation_failed', success: false });
  }
};
