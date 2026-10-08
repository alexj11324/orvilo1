# Onboarding consistency

Frontend-only cleanup of the sign-in portal and the `/onboarding` flow, from the onboarding UI audit.

## Changed

- **Portal brand panel (O-01).** The invented testimonial (a shadcn example quote with a made-up byline) is gone from `apps/auth/app/portal`, in both languages, along with its CSS. The panel keeps the logo lockup only.
- **One progress indicator (O-06).** `/onboarding` renders the `<ol>` step list only. Step numbers come from the array index instead of the i18n strings (`setup.stepName.*` replaces `setup.step.*`, so other locales do not show a doubled number before the translation job catches up). `OnboardingHeader` shows its counter only when given one.
- **One control height and form idiom (O-07).** The workspace, Agent and provider steps use 36px controls (`h-9` inputs, `size="lg"` buttons), `Field` + `FieldLabel htmlFor` instead of bare `<label>`, and `Collapsible` instead of `<details>`. The Electron sign-in input moves from 40px to 36px.
- **Action-specific errors with retry (O-08, frontend part).** Creating the workspace, verifying the Agent, saving the coordinator choice and finishing each show their own title and description (`setup.error.*`) in a `role="alert"` region with a Retry button that uses the latest field values. Submit buttons use `loading`, and an in-flight ref blocks double submits. The mapping lives in `src/features/Onboarding/errorCopy.ts` (401/403 keep the shared sign-in and permission copy).
- **Radio semantics (O-10, accessibility part).** `ConfiguredOrchestratorSelector` uses `RadioGroup`, so arrow keys move the selection and screen readers announce one choice instead of a list of toggles.
- **Electron (O-23, part).** The connection sheet has a visually hidden `SheetTitle`, and the inline styles on the sheet and the session-expired modal are Tailwind classes.

## Not changed

- **O-02** portal dark-only second visual system, **O-04** invitee flow, **O-05** back / skip / sign out / identity, **O-09** resume at the current step on refresh, **O-12** no device and no provider, **O-17** first-run landing, **O-18** "New Workspace" entry, **O-22** sign-in return path: each needs a product decision or is large.
- The term "Orchestrator" stays until product decides the name.
- Dead code and dead locale keys (`onboarding-2` block, unused `onboarding` and `desktop-onboarding` keys) are a separate cleanup.
- Slug conflict on the `Workspace URL` field needs a distinct backend error code, so the frontend cannot map it yet.
- `<a><Button>` nesting on the OAuth result pages and `zh-CN` Issue wording are already covered by #551 and #552.
