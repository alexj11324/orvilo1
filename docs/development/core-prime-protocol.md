# Pinned Prime protocol preparation

On 2026-09-30 the Linux cloud executor fetched the exact commit
`7d442aafa985f9342134fac16c2ef41f03fb45c1` from the public
[Prime repository](https://github.com/PrimeIntellect-ai/prime-agent/tree/7d442aafa985f9342134fac16c2ef41f03fb45c1).
The detached source checkout is `/workspace/scratch/prime-pinned`. No upstream
installation script, runtime, provider request or kernel was executed.

The pinned `packages/coding-agent/package.json` reports version `0.9.8`; the root
LICENSE is MIT. This is the requested TypeScript implementation, not current main.

Source-confirmed protocol facts:

- `packages/coding-agent/src/modes/acp/acp-mode.ts:574` uses SDK `ndJsonStream`
  on real stdout/stdin. The new transport therefore uses bounded newline-delimited
  JSON-RPC and attaches only to streams supplied by the trusted supervisor.
- The same file at line 737 returns the SDK protocol version; line 739 advertises
  `loadSession: false`, and line 746 identifies `prime-agent` at its build version.
- `session/new` permits one session per connection. Parallel sessions require
  distinct supervised processes; a client must not multiplex them onto one process.
- `acp-stop-reason.ts` distinguishes `end_turn`, budgets and cancellation. Its type
  also includes `refusal`; the recovered adapter treats unsupported terminal reasons
  as failures requiring termination. No stop reason authorizes task completion.
- `acp-mode.ts:1207` attempts disposal on transport closure. This cooperative
  cleanup is not independent evidence that all descendants have exited, so the
  Orvilo supervisor must still terminate and prove quiescence.
- CLI `args.ts` recognizes `--resume`; RPC `rpc-mode.ts:313` handles
  `switch_session`. These source surfaces do not establish restore correctness or
  safe process ownership. `PrimeExecutionRuntime.resume` stays unsupported until
  actual supervised recovery acceptance is possible.

The existing cloud restrictions on UID namespace mappings still prevent the real
OS isolation acceptance described in [the isolation evidence](./core-isolation-cloud-evidence.md).
Transport fixture tests establish wire behavior only, not a confined Prime launch.
