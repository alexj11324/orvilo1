# Main runtime closure + Visual87: reserved LIGHT FINAL

**Current disposition: P\[].** No remaining introduced P0/P1/P2 findings in the bounded 263-file source scope at `ecf034b91ff459c4c6621ee85b7c9e271e2808b1`, tree `afa966606262499d5110297d5168afb49c60e787`, against `origin/canary` `0b9b783fc74ac7a53380884635df584b5945ce94`. Current finite pre-PR eligibility is supported by the exact-commit Native015 evidence and all 20 current CI checks. Eligibility covers this source closure and its necessary repairs; broader publication and wholeGoal acceptance remain outside it.

This consumes the unique reserved FINAL for Main166 and Visual87, following their immutable INITIAL reviews. The responsive repair was assessed within that same ongoing FINAL. No second INITIAL, deep pass, reviewer orchestration, reviewer test/Node/Bun/Native execution, Root edit, install, commit, push, or external message occurred. The only reviewer write is this finite report.

## Scope and preparation

Read all actual changed spans and necessary complex owners/callers, including form/RHF state, latest-request/store saves and retries, locale boundaries, approval motion, editor lifecycle, public component contracts, workbook layout, SSR and necessary owning CI/test repairs. Scope began at clean `010ccf596b519ffa169153e1d9481ad9b30aaaa6` (262 files); the proven mobile regression required the existing GroupForm owner, making the final scope 263 files. Merged #757 and unaccepted future MD/font/code/avatar/Root20/spacing/lint and private SDK/App publication work are excluded.

Independently confirmed no `.agents/skills/deep-review-*` extensions. Read the complete Quick checklist sections, including nested examples, for ai-coding-bad-habits, code-style, logic, business-logic, reuse-architecture, performance, release-risk, security, compatibility, ux, observability, workflow and skill-freshness, plus applicable repository DESIGN/AGENTS/React/testing/token rules. New-feature was pruned. Applied repository calibration: introduced changes only; widespread/preexisting behavior is not a finding merely because it remains widespread. Security retains its specified exception.

Immutable initial evidence remains intact:

- Main initial review SHA256 `40734b7791d29bd8e9ae4aa15b96fce5bfd0674bf6040f0bcc7f7dcc1de2d88b`; initial-review-hashes SHA256 `b7398a3a0b343a3faa32e44063f6ac24f2d838c0ebfa223dd1de487ec1328bf9` under `/workspace/orvilo-evidence/native-next-main161`.
- Visual initial review SHA256 `caa69e1a8f90132f76fd27cb4fd750b1f4cc486d8adade1396657cb40cca1f74`; initial-review-hashes SHA256 `a05e22f7e985bf19cf1912a76536b7729090d873eff55a2c74435a5158c26c7c` under `/workspace/orvilo-evidence/native-visual-md-eightyseven`.

## Findings and closure history

**FINAL263-P1-01 — mobile model assignments lost the SDK's vertical layout. CLOSED.** Introduced; likelihood high; release-blocking yes when found; dimensions compatibility/UX. The introduced local Form import at `src/features/ServiceModel/ModelAssignmentsForm.tsx:10` and its Form call replaced a public SDK Form that defaults to vertical on mobile. The local grouped rows defaulted to horizontal. Actual Native014 390px PNGs showed description text wrapped to nearly one character per line and controls pushed thousands of pixels down. This violates the repository responsive/readability rules and preserves neither the old supported layout nor practical model-setting usability.

Repair in `ecf034b…`: the unconditional existing `useIsMobile` hook at ModelAssignmentsForm:34 drives `layout` at :224; `src/components/GroupForm/index.tsx:986` consumes the optional existing FormContext, and :1014 applies column/stretch alignment for vertical layout. Horizontal and standalone fallback, form engine, handlers, keys, permissions and save transport remain intact. Reviewed all necessary repair spans. The owning 17 cases and three-file lint/normal hooks pass (`/workspace/orvilo-evidence/newcloud-model-responsive-repair`). Native015's four actual layout receipts show all six mobile rows as columns, descriptions 306px wide with 1/3/4/2/3 lines, controls contained in their rows, and desktop rows still horizontal. I viewed the actual light/dark desktop/mobile representative PNGs. The readability defect is closed.

Other required original dispositions:

- **NEXT161-P2-02 — Floating collapse size: CLOSED in source.** FloatingChatPanel:194–197 uses the supported `{blockSize:32,borderRadius:'var(--radius-button)',size:16}` and retains coarse-pointer 44px minima. ActionIcon's 8px button-radius fallback and sizing contract agree. Finite Native control checks do not establish every routed Floating panel state.
- **NEXT161-P2-01 — declared SDK clear capability: CLOSED in source; original attribution remains withdrawn.** Actual physical5.51.2 base-ui Input lacked clear behavior; official5.56 implements it. Provider SettingModal:229–237 supplies a named pointer/keyboard Button, `field.onChange('')`, input refocus, disabled/busy forwarding and unchanged raw-payload semantics. No physical5.56-before runtime witness is fabricated. Native's scene named provider-clear tests ModelSelect's separate clear callback, not this provider-logo field.
- **NEXT161-P1-03 — owning Emotion context: CLOSED.** The real diagnostic's empty/undefined category context was repaired through Vitest's actual public module identity settings (`@emotion/react` dedupe/include). Fresh genuine5.56 QA and current remote owning CI support the closure. No product palette fallback or mock context was added; original diagnostic history is preserved.
- **ModelAssignments component-test necessity: superseded and eliminated.** Production now delegates actual RHF/model handlers to the exported `useModelAssignmentsForm`; its 17 cases mount real RHF and actual owning store/save hooks. The former new component test is removed, not renamed around an unchanged component test. Native separately checks actual model controls/payloads. No new component/style-mirroring tests were required for the responsive repair.
- **Visual Dense22 authored workbook line-height P2: CLOSED.** `SheetGrid.tsx:53` restores proportional1.35 only for authored font sizes while retaining default14/22. Native015 in all four matrices measures authored30pt as40px/54px, with authored fill/ink and genuine scroll/frozen-row behavior preserved. Authored column widths remain authored; narrow-column word splitting is not a new responsive policy.

## Verification and evidence integrity

Official npm `@lobehub/ui@5.56.0` was independently fetched read-only into memory and compared against all 3,110 installed public artifact files: 6,274,121 bytes, zero mismatches, matching npm SHA512 integrity. Shared React/DOM/Emotion/antd-style identities resolve to the genuine Root copies. This is public artifact restoration, not a private SDK build/release. Earlier `quality-33.log` used the old5.51 optimizer despite its initial attribution; that attribution is explicitly withdrawn. Fresh `quality-fresh-33.log` (SHA256 `e89a2ef206227f46156ebf8ff2f3c32b84238c0a49dd49dd6a86163f73752487`) passes 33 owning cases and five-file lint, and all eight actual optimizer UI entries resolve to the restored official5.56 package. Current repair's 17-case QA and all current CI checks cover the necessary subsequent source changes.

Native014 genuinely recorded 288 passing scalar/event checks, but its full module-paint claim was withdrawn: side-effect-only CSS imports dropped module rules while development sheets were disabled. Independent review found the missing scoped classes. `/workspace/orvilo-evidence/newcloud-current262-native-pass/module-css-evidence-withdrawal.json` preserves that distinction. Native009–013 failures and old cache/quality corrections remain failures/corrections, not relabeled passes.

**Native015 actual result:** `/tmp/orvilo-native-main-current-015`; current clean/frozen ecf commit; 305/305 checks; 52 matrix screenshots plus two modal screenshots; zero failures/browser errors/network errors; exit0; 111.165s; all owned processes closed; every memory-event delta zero. Five Electron development-CSP warnings are retained, so this is not a warning-free assertion. Independently recomputed all 3,282 source-binding hash/byte/mode descriptors: zero mismatches.

The rebuilt Desktop production CSS leaf retains all 53 actual live module maps/238 exported classes. All are present in CSS SHA256 `35f4ef5faedc1126a31285aff9ffff9a65bdde8fa1c4dd13ec710a53fb1646c1`. Canonical emitted map SHA256 `39928d7a98f529900c0893d661d25b26a6c1317a777d26f78d56490837ebe7a0` matches the proof. All 76 replacement receipts bind the 20 encountered modules/64 dev scoped classes, with no missing class/attribute/custom-property/keyframe and no stable computed-style differences across 238 mounted-node snapshots. I read the actual fatal assertions and export-preserving build path; DOM class substitution is not used. This proves the finite leaf/module binding and mounted comparisons, not every possible component/pseudo-state cascade.

Native audio now requires a fresh readiness receipt and the same connected media element: readyState4/duration3, paused true→false→true, no media error in both desktop themes. This closes the earlier stale-readiness coverage limitation for the fixture clip; it does not establish a backend/media catalog.

Key current artifact SHA256 values:

- runtime-report.json: `e917aa507f33cfb60ac144aebe88a0f291f6c2c465a5d01113adbc05e898e906`
- execution.json: `a2540e520eb5dcec162dd719c06af32970d44e7cc26c9168b6d63f99b6a09d70`
- source-binding.json: `d622264e4a3f37db33db7afb48304c637277125fbeb264d5ea71dae446ef2b5a`
- production-css-proof.json: `fb7bb60923fcf7d36152bc63206d54e1f79398d0d3ccd9f34d5f8648b1fd45d4`

Independently retrieved all20 current ecf check runs as completed/success, each with the correct head SHA: [owning/full CI](https://github.com/alexj11324/orvilo1/actions/runs/38405881933), [Web](https://github.com/alexj11324/orvilo1/actions/runs/38405881578), [geometry](https://github.com/alexj11324/orvilo1/actions/runs/38405881972). Historical010 passes are not used as a substitute.

## Separate pre-deploy limits and remaining work

Runtime acceptance is Electron43.2 with sandbox/contextIsolation/webSecurity true and nodeIntegration false; genuine production CSS leaf; 13 component scenes × two themes × nominal1240/390 widths × root16. Strict errors are unfiltered. Heap2048, deadline480s, admission and live resource floors remain unchanged. Root explicitly raised the artifact cap from512MiB to1GiB after008 hit generated-cache capacity rather than OOM; this operational deviation is disclosed. Current673,882,112 allocated bytes fit the approved1GiB cap.

The mobile assignments screenshots capture the internal scroll container at its top: actual main height960/overflowY:auto; the sixth description/controls sit below at y990/1072. Their BBoxes prove layout, and top-of-container PNGs do not prove below-fold paint or routed scrolling. The observed preexisting MultiSelect clear-button placement also remains a broader goal concern: Select and combobox owners have zero diff against base, so no introduced finding was assigned.

The first motion-disable remount is preexisting: baseline AppTheme already forwards false motion, and the same actual Antd MotionWrapper inserts a retained provider on its first false token. Native primes that first-off epoch before testing the same live actionable surface. Post-prime OS/user retention is supported; first-toggle state retention is not established or approved as a new exception.

Eight direct runtime antd/antd-style files remain at public locale/SSR boundaries; no named styling factories remain in the current census. Private SDK locale/reset/SSR publication and app consumption, future MD/font/code/avatar/Root20 widths, full routed desktop/app builds, IPC/backend/provider APIs, Mac/credentials, production writes and wholeGoal closure require their separate authorized work and evidence. No remaining blocker was found for the finite reviewed source eligibility; these broader release/completion conditions are not silently closed.
