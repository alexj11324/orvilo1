# Agent directory initial-load recovery

A direct link to the Agent directory starts its own deduplicated list fetch. Before the first successful response, a request failure replaces the loading skeleton with a recoverable error. Retry shows progress and remains disabled during SWR revalidation. The existing list remains visible if a background refresh fails after initialization. The successful empty directory retains its creation affordance. The error surface uses AsyncError recovery rules, including sign-in and access-denied handling.
