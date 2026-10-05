# Lab feature defaults

Labs experiments in `DEFAULT_PREFERENCE.lab` start enabled. The settings page reads them through `labPreferSelectors`. A missing flag uses that default. An explicit `false` stays off, so a person who turns an experiment off keeps it off.

`enableOAuthApps` stays `false`. The OAuth app console was removed from Labs, and a stored true must not bring that settings row back.

`enableGroupChat` and `enableEvalCapture` are not Labs toggles. They are left unset.
