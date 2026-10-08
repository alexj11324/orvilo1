# Authentication principal binding

This page describes the login foundation: how a Clerk identity becomes an Orvilo database principal, and how OIDC consent and API access retain that principal. The local `users.id` and external Clerk user ID can differ for migrated accounts. Callers must use the canonical database ID for ownership and the stored external ID for Clerk lookups.

## Clerk exchange and canonical identity

[The exchange service](../../apps/server/src/services/auth/index.ts) verifies the Clerk session JWT, checks its active Backend session, and requires the fetched Clerk user ID to match the verified token subject. Provisioning, account binding, and web-session creation run in one transaction; failure to create the session rolls back a new binding.

[Provisioning](../../apps/server/src/services/auth/clerk.ts) selects the local user in this order:

1. An existing `accounts` binding with `providerId = 'clerk'` and `accountId = clerkUser.id`.
2. A `users.id` equal to the Clerk ID.
3. A legacy row matched by normalized primary email or its raw email.
4. A new user keyed by the Clerk ID when none exists.

A legacy match retains its existing database ID. Once the external identity is bound, later primary-email changes update that same principal instead of selecting another row by email. Clerk primary-email metadata supplies the verification flag; this foundation does not require a verified-email status before its initial legacy-email lookup.

Conflicting bindings to different local users return a conflict. A binding whose canonical user has disappeared is unavailable; it does not fall back to email. The exchange rechecks ownership when inserting a deterministic account row and never rebinds another principal. [Exchange regressions](../../apps/server/src/services/auth/index.test.ts) cover conflicting identities, repeat exchanges, rollback, and email changes; [provisioning regressions](../../apps/server/src/services/auth/clerk.test.ts) cover legacy matching and missing canonical rows.

[Linked account methods](<../../src/app/(backend)/api/auth/accounts/route.ts>) resolve the current web-session owner first, then fetch Clerk users through that owner's stored Clerk bindings. They do not guess that the local user ID is a Clerk ID. Missing bindings or failed/mismatched Clerk lookups return `503`, rather than an apparently successful empty account list.

## OIDC session and consent ownership

[The Clerk exchange route](<../../src/app/(backend)/api/auth/clerk/route.ts>) clears a mismatched signed OIDC session before returning the new web-session cookie. [Session cleanup](../../src/libs/oidc-provider/session-cleanup.ts) affects only the session referenced by the browser cookie; matching sessions, other devices, and persistent grants are retained.

[Consent](<../../src/app/(backend)/oidc/consent/route.ts>) validates a nonempty interaction UID and obtains interaction details before recovering missing web authentication. The [OIDC service](../../apps/server/src/services/oidc/index.ts) checks that the returned interaction UID matches the request. An expired ordinary web session returns through sign-in; an interrupted device-code interaction is denied without issuing a grant.

When the authenticated local user differs from the OIDC session owner, consent submits a login result for that user before granting scopes. An existing grant is reused only when both account and client match; a mismatched grant is left intact and a new grant is selected. Interaction results disable merging with the previous submission. [Consent tests](<../../src/app/(backend)/oidc/consent/route.test.ts>) and [provider integration tests](<../../src/app/(backend)/oidc/consent/route.provider.test.ts>) exercise these ownership boundaries.

## API token recipients

[JWT validation](../../src/libs/oidc-provider/jwt.ts) requires ordinary API access tokens to use RS256, issuer `APP_URL` joined with `/oidc`, audience `urn:orvilo:chat`, and header type `at+jwt`. Required claims are `sub`, `iat`, `exp`, `jti`, and `client_id`; subject and client ID must be nonempty strings. An RP ID token, another API audience, or an unknown internal purpose cannot yield API user identity merely because its signature is valid. `openid` and `user:read` are not required scopes for this recipient contract.

Existing sandbox and operation tokens retain separate purpose contracts. Operation tokens require an explicit opted-in caller; [the TRPC context](../../packages/trpc/src/lambda/context.ts) opts in and validates the operation claims. [JWT regressions](../../src/libs/oidc-provider/jwt.test.ts) cover valid API recipients, wrong issuer/audience/type, internal-purpose rejection, and producer-specific tokens.

## Layer boundary

The foundation establishes principal selection, OIDC ownership, and API-recipient validation. Refresh-token replay handling, OS credential storage, and the later web-session token digest, persisted Clerk lifecycle binding, and expiry hardening belong to the dependent hardening layer. This page does not attribute those behaviors or standalone Google runtime verification to the foundation.

## Exchange rollback and rolling deployment

Provisioning and Clerk account binding commit with the web-session row. New-user business initialization and registration analytics run only after that transaction commits; a rolled-back exchange does not publish those external effects. A failure in post-commit initialization is logged without turning committed authentication into another failed exchange.

The nonunique `accounts(provider_id, account_id)` index supports identity resolution without introducing a uniqueness constraint against historical records. Migration replay creates the index idempotently. No production backfill or database apply is performed by preparing this change; actual Dev scale and production lock behavior remain deployment evidence to collect.

During rolling deployment, an explicit heterogeneous-operation caller accepts a signed, unexpired legacy token only when every modern contract marker is absent. A partially populated modern contract is rejected, and these tokens remain unavailable to ordinary API callers. The bridge preserves in-flight operations issued by older pods until their short-lived tokens expire.

Linked-account lookup failures render a recoverable unavailable state rather than treating unknown password/provider data as an empty account. Successful retry clears the error and publishes authoritative provider data.
