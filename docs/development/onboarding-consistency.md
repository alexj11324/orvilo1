# Onboarding consistency

Frontend-only cleanup of the sign-in portal and the `/onboarding` flow, from the onboarding UI audit.

## Changed

- **Portal brand panel (O-01).** The invented testimonial (a shadcn example quote with a made-up byline) is gone from `apps/auth/app/portal`, in both languages, along with its CSS. The panel keeps the logo lockup only.
- **One progress indicator (O-06).** `/onboarding` renders the `<ol>` step list only. Step numbers come from the array index instead of the i18n strings (`setup.stepName.*` replaces `setup.step.*`, so other locales do not show a doubled number before the translation job catches up). `OnboardingHeader` shows its counter only when given one.
- **One control height and form idiom (O-07).** The workspace, Agent and provider steps use 36px controls (`h-9` inputs, `size="lg"` buttons), `Field` + `FieldLabel htmlFor` instead of bare `<label>`, and `Collapsible` instead of `<details>`. The Electron sign-in input moves from 40px to 36px.
- **Action-specific errors with retry (O-08, frontend part).** Creating the workspace, verifying the Agent, saving the coordinator choice and finishing each show their own title and description (`setup.error.*`) in a `role="alert"` region with a Retry button that uses the latest field values. Submit buttons use `loading`, and an in-flight ref blocks double submits. The mapping lives in `src/features/Onboarding/errorCopy.ts` (401/403 keep the shared sign-in and permission copy).
- **Radio semantics (O-10, accessibility part).** `ConfiguredOrchestratorSelector` uses `RadioGroup`, so arrow keys move the selection and screen readers announce one choice instead of a list of toggles.
- **Electron (O-23, part).** The connection sheet has a visually hidden `SheetTitle`, and the inline styles on the sheet and the session-expired modal are Tailwind classes.

## Flow decisions (reference: Plane and Multica)

- **Back, identity, sign out (O-05; Multica for back and sign-out, Plane for identity).** Every step after the first has a Back button, disabled while a request is running. The header shows the signed-in avatar and name (email when there is no name); its menu has "Wrong email? Sign out".
- **Optional steps can be skipped (Multica).** The Agent and coordinator steps have "Skip for now", which finishes onboarding with what is saved. The workspace step stays required. This also removes the dead end on the Agent step when no device or provider exists (O-12). The main-layout first-Agent gate (`AgentOnboarding`, added in 963a0ab27 "fullscreen first-agent gate, device pick moves to settings", whose body gives a UX reason only: keep chrome out of mid-setup) now covers the app only while onboarding is unfinished (`gate.ts`). A finished or skipped user reaches the Issue list; the same setup content shows inline on Settings > Agents via `AgentSetupPrompt` when no usable Agent exists. No skip flag is stored (no existing field; guide-Issue creation is tracked in #566). The Issue assignee picker has no such prompt yet.
- **Resume (O-09, Multica's simpler form).** When the account already has a workspace checkpoint that exists, the first step shows "Continue with {name}" instead of the create form. Persisting the current step server-side is tracked in #566.
- **Landing (O-17, Multica).** Finishing onboarding lands on `/` (the Issue list) with no extra query. The unread `?onboarding=task` parameter and the never-used `variant="hero"` of `CreateTaskInlineEntry` are removed.
- **"New Workspace" (O-18).** Still points at `/onboarding`, which sends a finished account straight back. The repo has no standalone create-workspace dialog or page, so this stays open until one is built.

## Not changed

- **O-02** portal visual system (separate PR), **O-04** invitee flow, **O-22** sign-in return path: need backend work or are tracked separately.
- The term "Orchestrator" stays until product decides the name.
- Dead code and dead locale keys (`onboarding-2` block, unused `onboarding` and `desktop-onboarding` keys) are a separate cleanup.
- Slug conflict on the `Workspace URL` field needs a distinct backend error code, so the frontend cannot map it yet.
- `<a><Button>` nesting on the OAuth result pages and `zh-CN` Issue wording are already covered by #551 and #552.

The first-Agent gate also handles an unresolved authentication selector as false,
so it remains uncovered before the user state resolves. The existing gate
regression fails against the prior implementation (undefined instead of false)
and passes after; this also resolves the CI boolean-or-undefined type mismatch.
