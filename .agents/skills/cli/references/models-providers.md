# Retired Model and Provider Commands

The `orvilo model` and `orvilo provider` command groups were removed.
`apps/cli/src/program.ts` is the current command-registration owner.
Do not add their former tRPC calls back based on historical CLI examples.
Use the application's current model/provider settings for configuration and
`orvilo --help` for supported CLI operations.
