# Existing Linear OAuth Application Evidence

Captured read-only on 2026-09-25 from a fresh isolated copy of the user's authenticated Brave `Default` profile. No application setting, secret, token, or authorization was changed.

## Application

- Workspace: `BDI_Verifier` (`bdiverifier`)
- OAuth applications listed: 1
- Application name: `Orvilo`
- Created: Sep 5, 2026 by Alex Jiang
- Developer: `Aspectly Labs · https://patchbay.aspectlylabs.com`
- Description: `Connect Linear projects to Orvilo for issue import, publishing, and workspace synchronization.`
- Availability: `Private to this workspace`

## Client ID comparison

- The application's displayed Client ID was compared in memory against the latest `patchbay-linear-client-id` value from GCP project `general-secrets-store`.
- Result: **MATCH**.
- The full Client ID is intentionally omitted.
- Client secret, developer token, webhook signing secret, and their copy/rotate/create actions were not opened or used.

## Redirect URI

Before the authorized configuration change, the application exposed exactly one redirect URI:

`https://api.aspectlylabs.com/api/linear/oauth/callback`

The callback required by the current Orvilo deployment was absent:

`https://orvilo.aspectlylabs.com/oauth/linear/callback`

## Conclusion

`patchbay-linear-client-id` belongs to the existing `Orvilo` Linear OAuth application. Before the change recorded below, the application was configured only for the legacy Patchbay/API callback.

## Authorized redirect URI update

After the user provided immediate confirmation to save the persistent OAuth configuration change, the Orvilo callback was added as a second URI. The existing URI was preserved.

The saved application detail now visibly contains exactly these two callback entries:

1. `https://api.aspectlylabs.com/api/linear/oauth/callback`
2. `https://orvilo.aspectlylabs.com/oauth/linear/callback`

Linear returned the success notification `Application updated` / `"Orvilo" updated.` and navigated back to the application detail page. Both exact URI text nodes were present once and visible after saving.

Post-save checks confirmed the application name, developer, developer URL, description, workspace-private availability, webhook URL, and `Issues and Comments` webhook events remained unchanged. Secret, token, signing-secret, rotate, copy, and authorization actions were not used.
