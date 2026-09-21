# ReUI login and onboarding verification

Product source revision: `343eea7a5bd35e2682059c55769d52794deedbe7`.

The screenshots below were captured from the actual application on 2026-09-21,
not from the abandoned image prototype. The web runtime used a disposable local
PostgreSQL test account; Electron used an isolated development profile.

## Design sources

- [ReUI Auth 16](https://reui.io/blocks/application/auth/auth-16): full-page header,
  centered sign-in controls, and a restrained footer. The customer-logo claims
  from the demo are omitted.
- [ReUI Onboarding 4](https://reui.io/blocks/application/onboarding/onboarding-4):
  top progress bar and centered setup form. Existing six-step data, validation,
  submission, and completion behavior remain in the application.

The real registry source was inspected using the project's configured `@reui`
registry and the shadcn CLI. No registry credential or demo authentication code
is included in this change.

## Screenshots

| Surface                      | Evidence                                     |
| ---------------------------- | -------------------------------------------- |
| Desktop sign-in, light       | [Screenshot](desktop-login-light.png)        |
| Desktop sign-in, dark        | [Screenshot](desktop-login-dark.png)         |
| Desktop self-host connection | [Screenshot](desktop-server-light.png)       |
| Web sign-in                  | [Screenshot](web-login-light.png)            |
| Workspace setup              | [Screenshot](onboarding-workspace-light.png) |
| Setup saved                  | [Screenshot](onboarding-complete.png)        |

Desktop window captures are 1045 × 768; web captures are 1280 × 720.
The native screen-sharing indicator and development controls are not product
branding and were left intact in the captures.

## Runtime checks

- Web sign-in: empty submission shows validation, the email label targets its
  input, theme switching works, and primary-action text stays legible in both
  appearances. A scoped rule prevents Ant Design's unlayered reset from
  overriding the ReUI button foreground.
- Web setup: traversed all six steps with no invitations, went back and verified
  the name and selected role were retained, saved a real local workspace,
  reviewed settings, and submitted again. Database verification found one
  workspace with the chosen slug and the expected saved profile/setup values.
- Completion: the persisted user record has a non-null `finishedAt`; opening the
  completed workspace navigated to `/tasks?onboarding=task`, with the created
  workspace selected in the application sidebar.
- Responsive setup: checked a 390 × 844 CSS viewport. The document and form fit
  the viewport (`scrollWidth === clientWidth === 390`), heading text remained
  20 px, and step navigation worked. The initial profile was also inspected in
  dark appearance. Default desktop setup and completion fit the captured
  viewport with ordinary scrolling for longer steps.
- Native desktop: built main/preload and launched the actual Electron dev app;
  checked cloud/self-host entry, empty-address disabled state, server-address
  input, waiting/countdown state, and cancellation restoring enabled controls.
  A connection attempt to a closed loopback endpoint produced the real network
  failure feedback. Checked light/dark appearance and return from the server
  form to the login chooser. No production account was signed out or modified.
- Native CSS discovery initially failed because Tailwind scanned the Electron
  working directory. Explicit `source('../..')` anchors discovery at the repo
  root. The native CSS output then included the shared layout utilities, and
  the repaired window was visually rechecked before these captures.

## Automated checks

65 tests passed across these six focused suites:

```text
src/features/DesktopOnboarding/steps/LoginStep.test.tsx
src/features/Auth/SignIn/useSignIn.test.ts
src/features/AuthShell/AuthAgreement.test.tsx
src/components/blocks/onboarding-2/components/onboarding.timezone.test.ts
src/features/Onboarding/finishOnboarding.test.ts
src/features/Onboarding/workspaceResolution.test.ts
```

Changed TS/TSX and locale files passed the repository's scoped lint checks and
commit hooks. An independent light review and its bounded follow-up found no
blocking findings. The later one-line Tailwind source-root fix was validated
through the native runtime and CSS output. No local `tsgo` was run; repository
Typecheck belongs to remote CI.

## Verification limits

- External-provider OAuth completion and actual invitation delivery were not
  exercised; existing handlers remain in place and the relevant local auth,
  cancellation, retry, and persistence tests passed.
- The local task page reached after onboarding reports a backend error because
  this local database lacks `tasks.triage_status`. The local collaboration
  service also lacks `JWKS_KEY`. Neither is changed by this UI PR. These do not
  invalidate the observed profile/workspace saves and completion redirect;
  task execution and collaboration are not claimed as verified.
- The isolated Electron dev runtime has no built native notification addon.
  Notification permission behavior is unchanged and was not part of this run.
