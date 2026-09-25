# Team Home identity and navigation rail

## Evidence and scope

- Reference: authenticated `https://linear.app/bdiverifier/team/ORV/overview`, 2026-09-22, light theme, English, one visible member, empty description and Team resources.
- Candidate: `src/features/WorkTeams/TeamHome.tsx`, `devin/v6-linear-polish` dirty worktree. This slice owns identity, member display, team destination links, and responsive reflow only.
- Interaction model: links navigate on click. The observed name, icon, and description are editable in Linear, but their mutation/permission behavior was not exercised and is outside this slice.
- No private avatars or data are copied into product assets.

## Observed structure and geometry

At 1729 × 889, the main surface starts at x=244. The Overview/Documents/Members tab row begins at x=253, y=60 and sits in the page shell, not the Home content. The Home body is a 712px left column at x=481 and a 212px rail at x=1241, separated by 48px. The identity row's 36px icon is at x=493, y=120; the name is 24px/500 at x=541, y=122. The description text area starts at x=493, y=176, 15px/450. The rail begins at y=136 with a 12px gap between Members and Go to sections. A single 26px member avatar appears below Members. The four work links are 28px rows with 8px spacing.

At 768 × 900, the workspace sidebar is behind Menu. The identity icon is x=32, y=112. The member and destination rail is inline at y=211, before Team resources at y=261. At 390 × 844, the identity remains x=32, y=112; the inline rail wraps across y=211, 241, and 271. Team resources begins at y=321. The rail section headings disappear on narrow widths.

The reference Home contains no Active cycle, Projects summary, or Views summary section even though other team destinations exist. Its Go to links target Triage, Issues, Projects, and Views within the current team. The reference route targets are `/team/ORV/triage`, `/team/ORV/active`, `/team/ORV/projects/all`, and `/team/ORV/views/issues`; candidate query routes retain equivalent distinct destinations.

## Candidate implementation contract

- Show the real team icon/name/description from the team response, with the member roster resolved from the current workspace. Preserve loading and empty roster states.
- Use a flat desktop layout and wrap the rail between identity and the next content section on narrow surfaces. Use the WorkSurface container width rather than window-only media queries.
- Keep destination links scoped to `teamId` and `workspaceSlug`; respect `triageCapable`.
- Remove the Home-only cycles/projects/views summary queries and cards. Their own destinations remain reachable through Go to.
- Do not invent Documents, Team resources, Connect channel, or Team settings data or destinations. Those require domain and route owners. Do not present dead buttons.

## Verification and unknowns

- Regression: populated cycle/project/view data must not create extra Home sections; each Go to link retains the current team ID and workspace prefix.
- Runtime: inspect desktop and 390px Electron Home, click a team link and use Back, compare hierarchy and reflow against these measured states.
- Unknown: multiple members, true empty member roster, loading/error visuals, editor permissions, resource add/save/reload, and a team-specific Members destination. These need separate evidence and domain work.

## Candidate acceptance record

- On 2026-09-22, Electron `app://renderer/ws-useragenttes/teams/team_r6cxh0GBbfrI` was exercised at 1440 × 900 and 390 × 844 with the synthetic parity fixture. The baseline HEAD was `c191c163e`; the TeamHome file SHA-256 after the final correction is `6549f2bae90f38b655aea81468149c9c454375060ed436594c88339855344208`.
- Desktop capture: `docs/research/linear/team-pages/evidence/candidate-home-1440x900.png`. Mobile capture: `docs/research/linear/team-pages/evidence/candidate-home-390x844.png`. These show the delivered identity and member/Go to rail, along with the still-missing shared shell tabs and resource section.
- At 390px, the final name top was y=113 (reference y=114); the member/Go to rail began y=190 with links at y=206 (reference member/action links begin y=211). The remaining small offset belongs to the missing channel/settings links and full page shell.
- Clicking Go to Issues landed on `?tab=issues&scope=active`; clicking the Electron titlebar Back returned to the same Team Home route. The source reference click landed on `/team/ORV/active` and Back returned to `/team/ORV/overview`.
- `bun run check --lint --test` on the three Team Home source/test files passed: lint clean, two tests. The navigation regression first failed on the old All issues destination and passed after the Active route correction. No local `tsgo` ran.
