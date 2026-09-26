# GitHub App connection for Reviews

Reviews uses a personal GitHub App user grant. The Web and desktop clients use
the same Orvilo account, so a connection made from either client is available
to both. Access and refresh tokens stay on the server in
`github_user_connections`, encrypted with `KEY_VAULTS_SECRET`.

## GitHub App setup

Use an existing GitHub App with Pull requests read/write and Checks read
permissions. Install it on the repositories that should appear in Reviews.
Configure an exact user authorization callback URL:

```text
https://<APP_URL host>/oauth/github/callback
```

On the Orvilo server, set `GITHUB_APP_CLIENT_ID` and
`GITHUB_APP_CLIENT_SECRET` for that App, plus the existing `APP_URL`,
`KEY_VAULTS_SECRET`, database, and Redis configuration. Keep the client secret
out of Git and browser code. GitHub login through `AUTH_GITHUB_*` is a separate
SSO feature; Reviews does not require it. The Market connector is not involved
in this Reviews authorization path.

The Web app sends users to GitHub with a single-use state and PKCE challenge.
The callback requires the same signed-in Orvilo user who started the flow,
exchanges the code, verifies the GitHub user, and stores the grant. Desktop
opens the hosted Reviews page for this step; the browser session then provides
the callback binding, and the desktop app observes the resulting connection.
Access tokens are refreshed server-side when GitHub supplies an expiry and a
refresh token. Review write procedures remain disabled unless
`ORVILO_PR_REVIEW_WRITE=1` is explicitly configured.

## Acceptance

1. Complete the app's database migrations, then deploy the reviewed image at
   its verified commit SHA.
2. Sign into Orvilo on the Web, open Reviews, choose **Connect GitHub**, and
   authorize the installed App. Confirm that **Created** lists the current
   GitHub user's open pull requests, including drafts, and open one detail to
   check files and checks.
3. Sign into the desktop client as the same Orvilo user and confirm the same
   queue and detail are readable. If the grant is absent, its connect button
   opens the hosted Reviews page; finish authorization there. The connection
   is held by the server, so the desktop client does not need a second grant.
4. Confirm a user with no grant sees the connection action. A merged PR such as
   \#259 will not appear in either queue: both queue searches select open PRs.
   **For you** also excludes drafts; use **Created** to verify a draft PR.

Do not enable review writes from a passing read-only check. Validate a review
submission and its GitHub attribution separately before enabling that flag.
