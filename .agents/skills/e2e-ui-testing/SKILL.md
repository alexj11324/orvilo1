---
name: e2e-orvilo-ui-testing
description: How to drive Orvilo's SPA in headed Chrome for recorded E2E verification — CDP helper, cookie auth, and quirks of ReUI/base-ui menus, lobehub modals, and the task board.
---

# Orvilo E2E UI testing (headed Chrome)

For full-feature verification of Orvilo's React 19 SPA + Next proxy against the dockerless local stack.

## Devin Secrets Needed

- None for the seeded local user (preferred). `ORVILO_TEST_USER_EMAIL` / `ORVILO_TEST_USER_PASSWORD` exist for the prod-proxy sign-in path (see repo blueprint "dev servers" knowledge) but are unnecessary when a local DB + `auth_sessions` row exist.

## Launch headed Chrome with CDP

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 --user-data-dir=/tmp/o-chrome
```

Maximize via AppleScript bounds (wmctrl is Linux-only):

```bash
osascript -e 'tell application "System Events" to tell (first process whose frontmost is true) to set size of window 1 to {1600,1200}'
```

Keep a small CDP helper (Node 20+ global WebSocket) at e.g. `/tmp/cdp.mjs` with commands: `list`, `new`, `nav <i> <url>`, `eval <i> <js>`, `setcookie <name> <val> <url>`, `shot <i> <file>`. Use the `computer` tool with `cdp_port` for structured inspect/query/act on the page, and `eval` for state assertions (DOM, localStorage, `window.__errs`).

## Auth (seeded local user, no OIDC)

`init-dev-env.sh seed-user` creates the user + an `auth_sessions` row. Inject it:

```bash
node /tmp/cdp.mjs 9333 eval 0 "fetch('/api/auth/session').then(r=>r.status)"   # after cookie set
node /tmp/cdp.mjs 9333 setcookie orvilo_auth <session-token> http://localhost:<next-port>
```

`POST /trpc/lambda/<proc>` body `{"json":{...}}` with headers `Cookie: orvilo_auth=...` + `X-Workspace-Id: <ws>`; queries via `GET ?batch=1&input={"0":{"json":{...}}}`.

## Install an error hook early

```js
window.__errs = [];
addEventListener('error', (e) => __errs.push(String(e.message)));
addEventListener('unhandledrejection', (e) => __errs.push('rej:' + String(e.reason)));
```

## Quirks observed

- Digit accelerators (1-9) in ReUI dropdowns only fire when focus is NOT in the menu's search input (input/textarea/select/contenteditable/role=textbox|searchbox|combobox|spinbutton|slider are excluded). To arm them from the input: click the "Showing all items"/"Showing N items" caption — focus moves to the menu div, then digit keys work.
- Escape inside a picker search input does NOT close the menu (the input swallows the keydown) — click outside instead.
- `Ctrl+A` in a macOS text input moves to line-start (does NOT select). Use a triple-click to select text before typing a replacement.
- ReUI `Select` popups portal to `document.body`; inside a lobehub `createModal` dialog, clicking a Select option may be treated as an outside click and dismiss the whole dialog (verified on TaskScheduleDialog month/year selects — chevrons are the working alternative). Note: restoring via `onOpenChange` races (the same event closes the Select first and re-enables dismissal); restoring via `onOpenChangeComplete` holds the flag through the option click — verified working (option picks navigate, open-Select backdrop click safe, plain backdrop still dismisses). Probe: backdrop click while Select open should only close the Select.
- Menus are `[role=menu]` + `data-base-ui-portal`; frosted-glass check: `getComputedStyle(el).backdropFilter` (e.g. `blur(12px) saturate(1.5)`) is more objective than eyeballing translucency over white pages.
- Board cards may render offscreen horizontally — eval `getBoundingClientRect()` for real coordinates rather than guessing screenshot positions.
- macOS may draw a "local networks" permission dialog INSIDE the Chrome window — dismiss it by clicking its button (e.g. \~470,285 "Don't Allow").
- Theme: next-themes. `localStorage.setItem('theme','dark')` + reload flips to dark (`documentElement data-theme`); remove the key to restore system/auto. Settings → Common → themeMode is the UI path.
- Right-clicking empty board space (not a card) opens Chrome's own context menu — always locate the card rect first.
- NEVER pipe `bun run dev:spa` (or vite) output to `head`/`less`/any early-exiting command — SIGPIPE kills vite mid-session (symptom: proxy pages go blank, `curl :9877` → 000). Start detached: `SPA_PORT=9877 nohup bun run dev:spa > /tmp/vite-dev.log 2>&1`.
- Tailwind v4 `rotate-*` utilities emit the standalone `rotate` CSS property, NOT `transform` — `getComputedStyle(el).transform` reads `"none"` even when the element is visibly rotated. Check BOTH `.rotate` and `.transform` (this caused a false-positive "chevron doesn't rotate" report).
- The collapsed icon rail renders NO in-rail expand button (`SidebarTrigger` mounts only when expanded; `SidebarRail` isn't rendered). Expand via the page-header `Toggle Left Panel` button — don't report "no way to expand" until you've checked it.
- The 40px edge-fade scroll mask lives on `NavPanel/SideBarLayout` panels (agent topics rail, settings rail — class `base-ui-disable-scrollbar`), NOT the home sidebar. No overflow → stops collapse to 0px (correct). Force overflow by shrinking the window, then verify `maskImage` stops: bottom-only at scrollTop=0 → both mid-scroll → top-only at max.
- Fixed/portal elements (ConfirmModal `role=alertdialog`) report `offsetParent === null` — `!!d.offsetParent` falsely reads as invisible. Check `role` + `innerText` (+ screenshot) instead; filter duplicate `role=dialog` nodes by expected title.
- Settings is ONE unified surface at `/:slug/settings/<tab>` — the rail mixes user groups and workspace groups sharing the same collapsible-accordion chevron; verifying one group covers all settings contexts.
- Chrome may prompt once for https→localhost fetches ("Access other apps and services on this device") — Allow once, persists in the profile.
- DOM/CSS px ≠ tool-space px for screenshots/clicks — derive the scale from a known element's bounding rect before clicking small targets (≈0.64 on a 1600x1200 display with a \~1578px window).
