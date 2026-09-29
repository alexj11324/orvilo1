# Topic-list response ordering

## Observed failure

The AGENT-CONV-004 journey reached a database with two conversations while the
sidebar displayed only one for the entire 120-second assertion window. The
failure occurred before the delete action. It reproduced on separate release
branches whose conversation implementation and test were identical; another
run of that same code passed.

The affected runs were [36275817731](https://github.com/alexj11324/orvilo1/actions/runs/36275817731),
[36275819625](https://github.com/alexj11324/orvilo1/actions/runs/36275819625), and
[36275875478](https://github.com/alexj11324/orvilo1/actions/runs/36275875478).

## Ordering contract

A list request can begin before the gateway confirms a newly created topic and
return after confirmation. Once the optimistic ID is replaced, the topic is no
longer protected by the creating-topic set. Applying the older response could
therefore remove the confirmed row from client state.

The topic store now tracks membership revisions per container. List requests
capture the current revision; add, ID replacement, and deletion advance it. A
response that began before membership changed cannot overwrite the current
list. Requests begun after the change retain the existing reconciliation path.

## Verification

At source revision `c30af30e8`, the regression defers a fetch, adds and confirms a
same-ID gateway topic, then resolves the earlier list. It fails on the original
implementation and passes with the revision guard. The owning suite passed all
92 tests, scoped lint passed, and independent review approved the fix.

At source revision `a1d19bf16`, the guard was extended to `loadMoreTopics`: a
continuation page requested before an add/replace/delete can no longer resurrect
removed rows or drop confirmed ones, and the first-page/tail seam dedupes by
id. Regression tests cover the delete path on both the list fetch and the
continuation page (the latter fails on the previous revision); the suite now
passes 94 tests.

The remote AGENT-CONV-004 product journey remains the final runtime gate for the
release revision. Its result is recorded in the pull request checks.
