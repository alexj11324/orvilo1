# Linear parity execution contract

Adopted with user approval on 2026-09-22. This adapts the inspection/specification/
worktree/assembly workflow from
[AI Website Cloner Template](https://github.com/JCodesMore/ai-website-cloner-template).
It does not replace Orvilo's stack, introduce mock product behavior, or certify
any existing page as aligned.

## 1. Reference packet before implementation

For each page, record a topology and state inventory under
`docs/research/linear/<page>/`. Identify shared shell and page-owned regions.
Each component specification records:

- Reference URL, capture time, viewport, theme, language and relevant data/role.
- Screenshot location plus DOM geometry, typography and computed styles.
- Expected elements, forbidden extras, ordering and relationships.
- Observed initial, populated, empty, expanded, selected and responsive states.
- Trigger and outcome for each interaction; explicitly mark unobserved behavior.
- Existing Orvilo domain/component to reuse and precise implementation boundary.

Different fixture contents are not evidence of missing or extra functionality.
Find corresponding populated/empty reference states before deciding. Do not
delete real members or updates merely to resemble an empty reference project.

## 2. Safe, coordinated collection

Use the authenticated Linear CDP session and the actual Electron candidate.
One operator owns mutable browser navigation at a time. Reference inspection is
read-only: no indiscriminate click sweep, creation, submission, or deletion.
An unobserved state remains unverified rather than being guessed or silently
excluded. Keep credentials and private content out of committed evidence.

## 3. Build from bounded specifications

Establish shared layout/token ownership before parallel edits. Use isolated
worktrees, explicit file boundaries and revision-labelled specifications.
Preserve existing unrelated work. Reuse real models, permissions, services and
editors; a simulated save or renamed knowledge base is not document parity.
Implement layout/element presence before polishing individual pixel values.

## 4. Independent acceptance gates

| Gate        | Required evidence                                                              |
| ----------- | ------------------------------------------------------------------------------ |
| Structure   | Expected and extra elements checked across the inventoried states              |
| Visual      | Whole-page and component comparison under matching capture conditions          |
| Interaction | User-visible outcomes for each covered transition, including cancel/error      |
| Persistence | Authorized local write, reload/readback and permission checks where applicable |

Single-click `observed-match` only covers that observed transition. A passing
unit suite or component capture cannot approve a whole page. Any unavailable
reference state, unmatched environment or missing evidence stays explicit.
Never approve a changed screenshot baseline merely because the test failed.

## 5. Integrate and track

Primary agent accepts/rejects independent work before integration. Run scoped
repository checks, record the tested revision, and update the owning Linear
issue with remaining gaps. Keep Draft PR #209 and its existing branch; push
bounded checkpoints without unrelated Dependencies edits. Preserve the user's
final-only full-CI gate. Published evidence requirements remain in force;
local screenshots alone are not a publication substitute.

## Current priority

Project Overview requires populated member and update presentation evidence,
not only Add link modal verification. The link modal and generic multi-step
detector are parallel workstreams; document creation still needs real project
binding and compatible document permissions. None is a whole-project verdict.
