# Live UI behavior comparison

Run `node scripts/ui-parity/run.mjs scripts/ui-parity/composer.example.json /tmp/orvilo-composer-parity` with both authenticated reference and candidate applications open. The example keeps the original single `action` format and records one reviewed, registered composer-entry action; no expected destination is specified.

The runner is default-deny. A scenario's `"safety": "read-only"` fields are required classification metadata, not authorization. Before opening a CDP connection, `authorization.mjs` requires the scenario's authorization ID to match a reviewed registry entry exactly, including CDP endpoints, tab matches, starting URLs, readiness scopes, mappings, ordered action types, semantic names and optional selectors. Changing or adding any target, step or surface requires a reviewed registry change. Do not register create, submit, save, update, delete, archive, assignment/status changes or unknown controls. Mutation verification belongs in a separately authorized disposable/local fixture workflow, not this runner.

For an ordered flow, replace `action` with a non-empty `actions` array. Each entry must independently declare `"safety": "read-only"`; the runner rejects mixed legacy/new configuration, missing classifications, unknown action types, reload targets, and empty click targets before connecting. Omitted `type` remains a click for compatibility:

```json
{
  "actions": [
    { "names": ["Open properties"], "safety": "read-only" },
    { "names": ["View activity"], "safety": "read-only", "type": "click" },
    { "safety": "read-only", "type": "reload" }
  ],
  "authorization": "a-reviewed-registry-entry"
}
```

The JSON above illustrates the sequence shape; it will not execute until its exact plan is independently registered. The shipped composer example is registered. This prevents a `Delete` → `Confirm` sequence, or any other arbitrary clicks, from gaining authority merely by labeling itself read-only.

Actions run in order in the same tab, so every later click resolves against the state produced by the preceding action. Each click gets its own stable baseline, uniquely resolved semantic target, center-point hit test, immediately re-resolved target, trusted/matched event witness, settled changed state, trace, and before/after screenshots. A failure stops the sequence and the comparison stays inconclusive. A reload gets a new-document marker plus complete/idle/stable readiness checks; unlike a click, it may validly produce no semantic change, which lets a sequence compare whether preceding read-only state survives reload. A reload is observational only—it does not authorize save, submit, create, update, delete, archive, or any other write.

The runner requires one matching tab and one visible semantic target, verifies `elementFromPoint`, re-resolves immediately before a real CDP mouse click, and checks that a trusted click actually reached that element. It captures before/after screenshots and records route, dialog, menu, editor, selected/expanded state and focus changes. Explicit mappings normalize workspace and entity identities; never map different destination pages into the same value.

Exit 0 means **observed-match**, 1 means **different**, and 2 means **inconclusive**. Every corresponding step is compared; an early mismatch cannot be hidden by a matching final state. Missing or ambiguous targets, unconfirmed events, timeouts and no observable click transition cannot pass. Review `comparison.json`, each `trace.json`, and the screenshots together. Multi-step screenshots use `step-NN-before.png` and `step-NN-after.png`; a multi-step trace contains a `steps` array. Stable samples for 1.5 seconds are a bounded heuristic, not proof that all asynchronous work has completed.

For a legacy single `action`, parsing plus the trace and `comparison.json.runs.*` retain their original single-result object shape. Multi-step runs store ordered result arrays under `comparison.json.runs.*`. Execution compatibility is intentionally stricter: legacy scenarios without an exact reviewed authorization entry now fail before connecting.

This is a bounded sequence's observable behavior comparison, not automatic certification of an entire page. Different datasets, permissions, language and starting states require aligned fixtures. Editor accessibility names and placeholders are compared conservatively; differences require review. DOM structure and pixel equality, network semantics, delayed side effects, new windows, keyboard/text-entry actions, conditional branches and arbitrary scripting are not compared. Full-document navigation from a click may lose the click witness and correctly returns inconclusive; use an explicit `reload` step only for reload observation. Before broad use, enumerate the page's controls and keep an explicit coverage list; untested controls remain unverified. Only configure controls known to be read-only on the reference account. Submission, deletion, creation, toggle-with-write, save and archive actions are forbidden here and require a separate explicitly authorized fixture workflow.

Mappings still normalize labels and entity identities for aligned fixtures. Route normalization is deliberately narrower: only exact single URL segments or query values located from that surface's registered start URL and mapped to a `:placeholder` participate. Path/hash identities are bound to their original position and raw semantic prefix; query identities are bound to their original entry position and key. Matching always uses the unmodified segments or entries, so `/project/:entity` cannot leak into `/team/:entity`, while `/project/:entity/overview` can still normalize on `/project/:entity/activity`. Repeated query keys remain repeated and ordered; normalization maps individual entries without using `URLSearchParams.set`. Substrings, multi-segment destinations and mappings introduced only for a later destination do not normalize routes, so mappings cannot turn two newly different destination pages into a pass.

Regression checks: `node --test scripts/ui-parity/*.test.mjs`.

Each trace also includes a bounded `eventTrace` (128 pointer/mouse/focus events, with an overflow count). It records relative time, trusted/target-match flags, mouse buttons, target tag and the action target's expanded/connected state; it never records event-target text or input values. The first click witness is retained even if the diagnostic buffer fills. Listeners are armed only immediately before dispatch, not during baseline polling, and cleaned up on exit. These diagnostics do not influence semantic comparison or prove the cause of an intermittent failure. Navigation can destroy the trace along with its document.

Before clicking, the runner requires a complete document, a hittable target, no scoped loading indicators, and unchanged observable semantics and target geometry for 1.5 seconds. It rechecks that baseline after screenshot capture. Late-rendered controls restart the window; failure to establish a baseline is inconclusive, not a mismatch or pass. This bounded quiet-window heuristic cannot prove that arbitrarily delayed work has finished.

Before navigating to the scenario start, the runner marks the old window and waits for a new document before resolving controls. `Page.navigate` returning, or a matching URL alone, is not proof of a completed reload. This runner expects a document navigation; a same-document-only transition that retains the marker cannot pass readiness.

An optional per-surface `readinessScope` selector limits loading readiness to one visible page root. It must exist uniquely and contain the clicked control; missing/ambiguous roots cannot pass. Busy indicators outside it remain recorded as `outsideBusy` in every snapshot, not silently discarded. Route and all semantic changes are still observed document-wide (including portals). The example uses Orvilo's development source marker to locate its project layout; adapt this selector for other builds. A scoped result makes no health claim about the application shell.

Target resolution prefers named interactive controls over nested text labels; multiple matching controls remain ambiguous. Loading detection honors visible `aria-busy="true"` and indeterminate progress bars. Determinate progress alone does not block settling: applications should mark actual pending work with `aria-busy`. This accessibility-based heuristic does not replace network or application-specific completion evidence.
