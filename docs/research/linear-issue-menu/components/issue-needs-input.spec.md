# Issue completion and unanswered input

## Observable success

- A task with unresolved required input cannot enter Done through completion,
  verification, a manual API write, or direct SQL.
- A native user response is not accepted as delivered until its producer ACK.
- Timed-out, cancelled, or ended question channels do not become success merely
  because the ACP turn ends or the Agent produces final text.
- The task exposes the existing `needs_input` attention reason, with a static
  border while waiting or after its operation ended.
- A completed, acknowledged question remains historical, does not render as a
  fresh unanswered form, and does not prevent legitimate completion.

## Current evidence

INQ-3 currently has Done/succeeded while its native question stores `timed_out`,
`intervention.status=rejected`, and a cancelled(timeout) tool result. Its current
run never received an acknowledged answer. This is a false completion.

INQ-4 currently stores a resolved/approved native question, its response request
ID, the Narrow result, and same-session continuation. It remains Done unless
fresh evidence identifies a different unresolved input. A historical resolved
form must not be mistaken for a current question.

These local OSS runs have no generic `agent_interventions` records. The existing
normalized `message_plugins` structured native state is therefore essential.

## Invariants and responsible boundaries

- Correlate input to the task's current topic/execution generation and operation;
  earlier superseded runs must not block a fresh task forever.
- Native `heterogeneousIntervention.transition=resolved` is the existing
  producer-owned ACK boundary. `askUserAnswers` drafts alone are not proof.
- Generic heterogeneous intervention items require resolved status and producer
  ACK; runtime intervention items require a committed continuation.
- Preserve current question state on pending/published response, transport
  failure, timeout, or session teardown. Do not infer outcomes from model prose.
- A SQL predicate owns the unmet-input answer for completion and reader
  projection. A task trigger rejects entry to Done while this predicate holds.
- The lifecycle checks the same predicate before settling topic/dispatch as
  successful or invoking success-driven review/integration effects.
- Persist attention in the existing execution park marker; no new status enum.
- A waiting live operation may resume through its existing authenticated answer
  transport. A terminal or failed operation requires an honest retry; never
  claim it continued without a producer ACK and subsequent activity.
- Preserve the strict active-workflow entry gate requiring both stored
  assignees and correlated real executing Agent. Waiting/failed input is not a
  reason to manufacture a running Agent or an active entry.

## UI/read contract

The server projects `attentionReason=needs_input` from current structured input.
An existing attention board may show a Needs input lane. Dependency blocking
remains a separate concern. Inbox shows actionable original forms only for a
live pending question; a closed channel explains retry instead of presenting a
form as resumable. Historical resolved forms show the acknowledged answer.

## Focused verification

1. Direct SQL/model completion rejects pending input.
2. User answer without producer ACK still rejects completion.
3. Producer ACK/resolved question plus real continuation allows completion.
4. Timeout/session-ended/tool-channel failure cannot become Done/succeeded.
5. A superseded historical input does not block a fresh generation.
6. Native Inbox read reflects pending, resolved, and ended-channel distinctions.
7. Actual product evidence uses the existing INQ fixtures and a real Agent;
   no inert dispatch phases or auto-answered forms count as acceptance.
8. Correct only the proven false local fixture through ordinary API/settlement
   with history; no production changes or historical-data backfill.

## Scope

No model-output keyword matching, new dependency-block status, fake liveness,
new answer transport, automatic retry loop, or broad data migration.
