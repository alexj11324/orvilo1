# Topic deletion E2E identity check

The conversation deletion scenario used the first 30 characters of the selected row's text to verify deletion. Topic titles are not unique and may change during streaming, so another same-title row could make a successful deletion fail. The assertion also read the count once after fixed sleeps and silently passed when no title had been captured.

Capture the selected row's existing `data-topic-id`, require it to exist, open that exact row's menu, and use Playwright's retrying count assertion to verify that identity disappears. Keep the UI deletion flow and its existing confirmation intact. No production code or test exclusion changes.

Observed failures: #645 initial Web run (job 114148639824) and #646 retry (job 114162386417), both at the title-based count assertion. The existing deletion scenario is the regression case; its post-change result must come from CI. Scoped lint does not prove the full application journey.
