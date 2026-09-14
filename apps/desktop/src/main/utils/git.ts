/**
 * Git repo-type / gitdir helpers. The implementations now live in
 * `@orvilo/local-file-shell` so desktop, the device RPC, and the CLI share one
 * copy; re-exported here to keep existing `@/utils/git` import sites stable.
 */
export { detectRepoType, resolveCommonGitDir, resolveGitDir } from '@orvilo/local-file-shell/git';
