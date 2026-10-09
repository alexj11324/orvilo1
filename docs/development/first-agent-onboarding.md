# First Agent onboarding

An unfinished signed-in account enters first-Agent setup before the workspace wizard or main content, including a direct workspace URL. Availability checks use the saved Agent profile, provider binding and execution target; a profile count alone cannot complete setup.

Prime setup verifies an OpenAI-compatible provider/model and an explicitly selected online device. ACP setup starts discovery against the selected target and reconciles the saved profile before proceeding. Reloading reuses the saved setup checkpoint.

Workspace completion re-reads ownership and persists the first Agent's member device preference before marking onboarding finished. It selects that same Agent afterward. Desktop onboarding marker repair runs only in Electron; web setup does not call desktop IPC.

Personal devices remain outside the workspace device pool. A member's explicit personal-device route is verified against that caller's gateway pool. The first Prime topic keeps the selected model/provider, and broker validation accepts canonical text blocks and tool history through the shared sanitized-request validator.

The gate and setup surface reuse Spinner and AsyncError for loading and retry. Workspace hydration retains its existing skeleton while saved setup resolves. Verify a fresh account in Electron through setup, workspace creation, a persisted result and reload; unit checks alone do not certify the release.

The shared header positions its Back-button wrapper, leaving the local Button primitive free to apply its normal press movement. Applying the vertical centering transform to the Button itself conflicts with its active translation and moves it away from the pointer during a click. Verify the native mouse press and Back navigation alongside checkpoint resume and failed-Skip recovery.
