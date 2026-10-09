---
name: testing-accounts-portal
description: 'E2E/browser testing of the accounts portal at accounts.aspectlylabs.com (apps/auth Cloudflare worker): sign-in flow, session exchange, locale, contract endpoint.'
user-invocable: false
---

# Testing the accounts portal (accounts.aspectlylabs.com)

The accounts portal is `apps/auth` — a React Router SPA prerendered/served by a
Cloudflare worker (`apps/auth/workers/app.ts`). It replaced the Cordy broker.

## Test credentials (Devin Secrets Needed)

- `ORVILO_TEST_USER_EMAIL` / `ORVILO_TEST_USER_PASSWORD` — Clerk test user on
  clerk.aspectlylabs.com with `bypass_client_trust=true`, so email+password
  sign-in completes with no second factor. Type `${ORVILO_TEST_USER_*}`
  references in browser fields; do not write them to files.

## Session-state gotchas (order your tests around these)

- **Once signed in, `/login` never shows the form again.** `portalLogin.tsx`
  sees `isSignedIn`, POSTs the Clerk session JWT to
  `{productOrigin}/api/auth/clerk`, then `window.location.assign(returnUrl)`
  (default `https://orvilo.aspectlylabs.com/`). Do all portal visual/locale
  checks **before** signing in.
- **Reset portal session state** with `https://accounts.aspectlylabs.com/login?sign_out=1`
  (or `?force=1`) — calls Clerk `signOut({redirectUrl:'/login'})` and returns to
  a clean email form.
- **Signed-out state on the product**: `orvilo.aspectlylabs.com/` → 302
  `/signin?callbackUrl=…`; its page links to accounts. Signed-in = product SPA
  shell (e.g. `/tasks`), not `/signin`.

## Quick recon endpoints (curl-safe, no session needed)

- `GET /` → 302 `/login`
- `GET /v1/contract` → broker JSON (`name:"orvilo-auth-broker"`,
  `authority.identity:"clerk"`, `client.clerkExchangePath:"/auth/clerk"`,
  `origins.{api,broker,product}`)
- `GET /login?hl=zh-CN` → served HTML has `<html lang="zh-CN">`; Chinese copy is
  client-rendered from `documentElement.lang` (`messagesForLocale` ships en +
  zh-Hans only; other `hl` values fall back to en)
- `GET /login` HTML contains `window.__PORTAL_CONFIG__` with the live
  `clerkPublishableKey` (`pk_live_…`) and `productOrigin`

## Worker routing (what URLs should do)

- `/` and legacy paths (`/signin`, `/signup`, `/verify-email`,
  `/reset-password`, `/auth-error`, `/market-auth-callback`) → 302 `/login`
  (legacy preserves query string)
- `/oauth/*`, `/login`, `/sign-in/*` → the SPA document
- any other non-asset path → 302 to the product origin

## Sign-in flow + failure signatures

Steps: email (`#accounts-email`) → "Sign In with Email" → password step
("Enter your password", `#accounts-password`) → "Sign in" →
`signIn.finalize()` → session exchange POST → product redirect.

Regressions to capture if seen:

- `Session exchange failed (NNN)` rendered as `role=alert` staying on `/login`
  (exchange endpoint down/broken — the #305/#313 class of bug)
- Redirect ping-pong between `accounts…/login` and `orvilo…/signin`
- Landing on product `/signin` after password submit (cookie not minted)
- A language selector or theme button in the header = wrong shell (that is the
  auth routes' `AuthContainer`). The portal renders the shared `EntryShell`
  with `data-testid="accounts-auth-shell"`: the mark above the title, a list of
  sign-in methods (email asks for its address on the next screen), terms under
  it, following the light/dark theme. A two-panel dark layout is the
  pre-unification portal.

## Launch + attach

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/orvilo-test-chrome \
  --no-first-run --no-default-browser-check --new-window "https://accounts.aspectlylabs.com/"
```

- The `computer` browser target reports `unavailable` until Chrome runs with a debug
  port; then pass `cdp_port: 9222` on every browser inspect/query/act call.
- Use a throwaway `--user-data-dir` so no profile lock or stale session interferes.
- Maximize for recording via AppleScript (no wmctrl on macOS):
  `osascript -e 'tell application "Google Chrome" to set bounds of front window to {0, 25, 1600, 1200}'`
  (desktop bounds from `tell application "Finder" to get bounds of window of desktop`).

## Omnibox autocomplete pitfall (costs time if unknown)

After typing a URL in the omnibox, Chrome often appends an inline suggestion as
SELECTED text (e.g. typing `…/login` shows `…/login?hl=zh-CN` with the suffix
highlighted). Pressing Return then navigates to the suggestion, not your text.

- If a suffix is selected: press `BackSpace` once — it deletes ONLY the selected
  suggestion, leaving your verbatim URL. Then Return.
- If nothing is selected: `BackSpace` deletes your last typed character — screenshot
  the omnibox before Return when the exact URL matters (e.g. `/login` vs `/logi`,
  which 302s to the product via the worker catchall and gives misleading evidence).
- Clicking the omnibox selects all text reliably; `cmd+l` also works.

## Page-driving notes

- `act`/`query` with `cdp_port` work on page DOM (`focus` + `type` fills fields fine);
  coordinate clicks also work — the email button is inert until email is non-empty.
- After a successful sign-in Chrome shows the native "Save password?" sheet — click
  "Never"/"No Thanks" to dismiss; it is browser chrome, not the portal.
- Chrome may show a Google Translate popup on the zh-CN page — `Escape` dismisses it.
- Field selectors: `#accounts-email`, `#accounts-password`; buttons "Sign In with
  Email" / "Sign in"; footer links "Use a verification code instead" / "Back".
