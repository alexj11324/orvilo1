# GitHub hosted MCP read-only acceptance

Acceptance ran against the connector implementation at source revision
`a253f02aac6522cc74c9868b9eb4b2394ebb7822` for PR #287. The disposable probe
bundle had SHA-256
`9449c27ade0583ab262e6631f4ee4cf1eedabec5e1df51b747f165056ebf851b`.

The probe reused the existing per-user GitHub App grant and constructed the
server-owned ephemeral transport. GitHub's hosted MCP server advertised exactly
these three tools:

- `list_pull_requests`
- `pull_request_read`
- `search_pull_requests`

The acceptance allowlist retained all three tools and found no unexpected or
write-like names. It then called only `pull_request_read` with method `get` for
`alexj11324/orvilo1#287`.

Observed results:

- Restricted transport: passed
- Existing grant available: passed
- Grant refresh performed: false
- Connector mutation path used: false
- `pull_request_read` advertised: passed
- Read call succeeded: passed
- Response was non-empty: passed
- Response matched PR #287: passed
- Unexpected tools: 0
- Write-like tools: 0
- Temporary probe cleanup: verified

This confirms provider compatibility for the existing GitHub App grant and the
current read-only pull-request surface. The established Reviews OAuth callback
remains the authorization path, so an already valid grant does not require a
second consent flow. This predeployment probe does not replace exact-revision
deployment and product-path verification.
