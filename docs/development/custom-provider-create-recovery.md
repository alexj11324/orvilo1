# Custom provider creation recovery

Rejected provider creation leaves the modal and entered values available for retry, clears pending state and shows the server message or localized fallback. Successful creation navigates to the provider settings and closes the modal. A list refresh failure after the provider has been persisted does not report creation as failed. Desktop proxy network errors use the same notification host and identity as the global TRPC notification, avoiding duplicate offline/timeout notices. Normal backend errors retain local creation feedback.
