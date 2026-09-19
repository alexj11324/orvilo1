/**
 * GraphQL documents used by the pull-request review service.
 *
 * Every document is contract-tested against the committed GitHub schema
 * fixture (`__fixtures__/github-schema.docs.graphql`, fpt variant) in
 * `schema.test.ts` — a field that doesn't exist in the schema fails the test,
 * which is how the removed `PullRequestReviewComment.side` field (thread
 * direction lives on `PullRequestReviewThread.diffSide`/`startDiffSide`) is
 * kept from regressing.
 *
 * Do NOT guess REST field names on GraphQL objects — check the schema first.
 */

export const QUEUE_QUERY = `
query PullRequestReviewQueue($query: String!, $first: Int!, $after: String) {
  rateLimit { cost remaining resetAt }
  search(query: $query, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        url
        isDraft
        additions
        deletions
        changedFiles
        reviewDecision
        updatedAt
        author { login avatarUrl }
        repository { nameWithOwner databaseId }
      }
    }
  }
}`;

export const DETAIL_QUERY = `
query PullRequestDetail($owner: String!, $repo: String!, $number: Int!) {
  rateLimit { cost remaining resetAt }
  viewer { login }
  repository(owner: $owner, name: $repo) {
    viewerPermission
    pullRequest(number: $number) {
      id
      number
      title
      body
      url
      state
      isDraft
      additions
      deletions
      changedFiles
      mergeable
      reviewDecision
      baseRefName
      headRefName
      headRefOid
      author { login avatarUrl }
      commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              state
              contexts(first: 50) {
                totalCount
                pageInfo { hasNextPage endCursor }
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion startedAt completedAt detailsUrl }
                  ... on StatusContext { context state targetUrl }
                }
              }
            }
          }
        }
      }
      reviewThreads(first: 20) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          diffSide
          startDiffSide
          viewerCanReply
          comments(first: 10) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              databaseId
              body
              createdAt
              path
              line
              outdated
              author { login avatarUrl }
            }
          }
        }
      }
      pendingReviews: reviews(states: [PENDING], first: 5) {
        nodes { id createdAt state author { login } }
      }
      reviews(first: 20) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          databaseId
          body
          state
          submittedAt
          commit { oid }
          author { login avatarUrl }
        }
      }
    }
  }
}`;

/**
 * Write-gate context: re-resolves identity, repository permission, the PR's
 * current head, pending review and every loaded thread/review id so a write
 * can verify the caller still sees what they reviewed.
 */
export const REVIEW_CONTEXT_QUERY = `
query PullRequestReviewContext($owner: String!, $repo: String!, $number: Int!) {
  rateLimit { cost remaining resetAt }
  viewer { login }
  repository(owner: $owner, name: $repo) {
    viewerPermission
    pullRequest(number: $number) {
      id
      number
      headRefOid
      changedFiles
      reviewThreads(first: 100) {
        totalCount
        nodes { id }
      }
      pendingReviews: reviews(states: [PENDING], first: 5) {
        nodes { id createdAt state author { login } }
      }
      reviews(first: 30) {
        nodes { id databaseId body state submittedAt commit { oid } author { login } }
      }
    }
  }
}`;

export const THREADS_PAGE_QUERY = `
query PullRequestThreadsPage($owner: String!, $repo: String!, $number: Int!, $first: Int!, $after: String) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      headRefOid
      reviewThreads(first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          diffSide
          startDiffSide
          viewerCanReply
          comments(first: 10) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              databaseId
              body
              createdAt
              path
              line
              outdated
              author { login avatarUrl }
            }
          }
        }
      }
    }
  }
}`;

export const REVIEWS_PAGE_QUERY = `
query PullRequestReviewsPage($owner: String!, $repo: String!, $number: Int!, $first: Int!, $after: String) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      headRefOid
      reviews(first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          databaseId
          body
          state
          submittedAt
          commit { oid }
          author { login avatarUrl }
        }
      }
    }
  }
}`;

export const CHECKS_PAGE_QUERY = `
query PullRequestChecksPage($owner: String!, $repo: String!, $number: Int!, $first: Int!, $after: String) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      headRefOid
      commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              contexts(first: $first, after: $after) {
                totalCount
                pageInfo { hasNextPage endCursor }
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion startedAt completedAt detailsUrl }
                  ... on StatusContext { context state targetUrl }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Thread node lookup — also the thread↔PR binding proof: the thread's owning
 * pull request and repository are resolved in the same query, so a thread id
 * lifted from another PR can never be answered under the routed one.
 */
export const THREAD_COMMENTS_QUERY = `
query PullRequestThreadComments($threadId: ID!, $first: Int!, $after: String) {
  rateLimit { cost remaining resetAt }
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      id
      diffSide
      path
      viewerCanReply
      pullRequest {
        id
        number
        headRefOid
      }
      repository {
        nameWithOwner
      }
      comments(first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          databaseId
          body
          createdAt
          path
          line
          outdated
          author { login avatarUrl }
        }
      }
    }
  }
}`;

/**
 * Reconcile lookup for a possibly-landed review: after a timeout or an empty
 * mutation payload we check the viewer's submitted reviews before retrying —
 * never blind-resubmit.
 */
export const REVIEW_RECONCILE_QUERY = `
query PullRequestReviewReconcile($owner: String!, $repo: String!, $number: Int!, $viewer: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      headRefOid
      reviews(author: $viewer, first: 15) {
        nodes {
          id
          databaseId
          body
          state
          submittedAt
          commit { oid }
          author { login }
        }
      }
    }
  }
}`;

export const CREATE_PENDING_REVIEW_MUTATION = `
mutation CreatePullRequestReview($input: AddPullRequestReviewInput!) {
  addPullRequestReview(input: $input) {
    pullRequestReview { id databaseId state }
  }
}`;

export const SUBMIT_REVIEW_MUTATION = `
mutation SubmitPullRequestReview($input: SubmitPullRequestReviewInput!) {
  submitPullRequestReview(input: $input) {
    pullRequestReview { id databaseId state url commit { oid } }
  }
}`;

export const REPLY_THREAD_MUTATION = `
mutation AddPullRequestReviewThreadReply($input: AddPullRequestReviewThreadReplyInput!) {
  addPullRequestReviewThreadReply(input: $input) {
    comment { id databaseId }
  }
}`;

export const ADD_THREAD_MUTATION = `
mutation AddPullRequestReviewThread($input: AddPullRequestReviewThreadInput!) {
  addPullRequestReviewThread(input: $input) {
    thread { id }
  }
}`;

/** Every document in the service, enumerated for the schema contract test. */
export const GRAPHQL_DOCUMENTS = [
  { document: ADD_THREAD_MUTATION, name: 'AddPullRequestReviewThread' },
  { document: CHECKS_PAGE_QUERY, name: 'PullRequestChecksPage' },
  { document: CREATE_PENDING_REVIEW_MUTATION, name: 'CreatePullRequestReview' },
  { document: DETAIL_QUERY, name: 'PullRequestDetail' },
  { document: QUEUE_QUERY, name: 'PullRequestReviewQueue' },
  { document: REPLY_THREAD_MUTATION, name: 'AddPullRequestReviewThreadReply' },
  { document: REVIEW_CONTEXT_QUERY, name: 'PullRequestReviewContext' },
  { document: REVIEW_RECONCILE_QUERY, name: 'PullRequestReviewReconcile' },
  { document: REVIEWS_PAGE_QUERY, name: 'PullRequestReviewsPage' },
  { document: SUBMIT_REVIEW_MUTATION, name: 'SubmitPullRequestReview' },
  { document: THREAD_COMMENTS_QUERY, name: 'PullRequestThreadComments' },
  { document: THREADS_PAGE_QUERY, name: 'PullRequestThreadsPage' },
] as const;
