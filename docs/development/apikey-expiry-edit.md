# API key expiry edit

Editing an API key's expiry date compares instants (`isExpiryUnchanged`), not a string against a `Date`. Re-submitting the same date no longer re-saves the key, and an unparsable value is dropped instead of being sent as an Invalid Date.
