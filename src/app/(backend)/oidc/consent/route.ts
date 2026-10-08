import { getUserAuth } from '@orvilo/utils/server';
import debug from 'debug';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { OIDCService } from '@/server/services/oidc';

const log = debug('orvilo-oidc:consent');

export async function POST(request: NextRequest) {
  log('Received POST request for /oidc/consent');
  try {
    const formData = await request.formData();
    const consent = formData.get('consent') as string;
    const uid = formData.get('uid');
    if (typeof uid !== 'string' || !uid) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    log('POST /oauth/consent - choice=%s', consent);

    const oidcService = await OIDCService.initialize();

    let details;
    try {
      details = await oidcService.getInteractionDetails(uid);
      log(
        'Interaction details found - prompt=%s, client=%s',
        details.prompt.name,
        details.params.client_id,
      );
    } catch (error) {
      log(
        'Error: Interaction details not found - %s',
        error instanceof Error ? error.name : 'unknown error',
      );
      if (error instanceof Error && error.message.includes('interaction session not found')) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description:
              'Authorization session expired or invalid, please restart the authorization flow',
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const { prompt } = details;
    let result;
    if (consent === 'accept') {
      log(`User accepted the request, Handling 'login' prompt`);
      const { userId } = await getUserAuth();
      log('Authenticated web identity available: %s', Boolean(userId));

      // Recover through the normal sign-in page after validating the interaction cookie.
      if (!userId && details.deviceCode) {
        // The SDK has already put this DeviceCode in flight; finish it without issuing a grant.
        result = {
          error: 'access_denied',
          error_description: 'The web session expired; restart device authorization',
        };
      } else if (!userId) {
        const authorization = new URLSearchParams();
        for (const [name, value] of Object.entries(details.params)) {
          const values: unknown[] = Array.isArray(value) ? value : [value];
          for (const parameter of values) {
            if (typeof parameter !== 'string') {
              return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
            }
            authorization.append(name, parameter);
          }
        }
        // A cross-account Clerk exchange may remove the old OIDC Session during sign-in.
        const callbackUrl = `/oidc/auth?${authorization}`;
        const query = new URLSearchParams({ callbackUrl });
        return new NextResponse(null, { headers: { location: `/signin?${query}` }, status: 303 });
      } else if (details.prompt.name === 'login' || details.session?.accountId !== userId) {
        result = {
          login: { accountId: userId, remember: true },
        };
      } else {
        log(`Handling 'consent' prompt`);

        // 1. Get necessary IDs
        const clientId = details.params.client_id as string;

        // 2. Find or create Grant object
        const grant = await oidcService.findOrCreateGrants(userId, clientId, details.grantId);

        // 3. Add user-consented scopes and claims to Grant object
        //    This information is typically in details.prompt.details
        const missingOIDCScope = (prompt.details.missingOIDCScope as string[]) || [];
        if (missingOIDCScope) {
          grant.addOIDCScope(missingOIDCScope.join(' '));
          log('Added OIDC scopes to grant: %s', missingOIDCScope.join(' '));
        }
        const missingOIDCClaims = (prompt.details.missingOIDCClaims as string[]) || [];
        if (missingOIDCClaims) {
          grant.addOIDCClaims(missingOIDCClaims);
          log('Added OIDC claims to grant: %s', missingOIDCClaims.join(' '));
        }

        const missingResourceScopes =
          (prompt.details.missingResourceScopes as Record<string, string[]>) || {};
        if (missingResourceScopes) {
          for (const [indicator, scopes] of Object.entries(missingResourceScopes)) {
            grant.addResourceScope(indicator, scopes.join(' '));
            log('Added resource scopes for %s to grant: %s', indicator, scopes.join(' '));
          }
        }
        // If RAR (Rich Authorization Requests) is used, it also needs to be added to grant
        // if (prompt.details.rar) {
        //   prompt.details.rar.forEach(detail => grant.addRar(detail));
        // }

        // 4. Save Grant object to get its jti (grantId)
        const newGrantId = await grant.save();
        log('Saved consent grant');

        // 5. Prepare result containing grantId
        result = { consent: { grantId: newGrantId } };

        log('Consent result prepared with grantId');
      }
      log('User %s the authorization', consent);
    } else {
      log('User rejected the request');
      result = {
        error: 'access_denied',
        error_description: 'User denied the authorization request',
      };
      log('User %s the authorization', consent);
    }

    log('Interaction result prepared');

    const internalRedirectUrlString = await oidcService.getInteractionResult(uid, result);
    log('OIDC Provider resume URL prepared');

    // The gateway rewrites Host on the way to the origin, so the server cannot tell which
    // public origin the browser is on. A relative Location keeps it on the origin that holds
    // the interaction cookies.
    const { pathname, search, hash } = new URL(internalRedirectUrlString);
    const location = `${pathname}${search}${hash}`;

    log('Redirecting to resume authorization');
    return new NextResponse(null, { headers: { location }, status: 303 });
  } catch (error) {
    console.error('Error processing consent:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Error processing consent',
      },
      { status: 500 },
    );
  }
}
