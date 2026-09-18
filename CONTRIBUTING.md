# Orvilo - Contributing Guide 🌟

We're thrilled that you want to contribute to Orvilo, the future of communication! 😄

Orvilo is an open-source project, and we welcome your collaboration. Before you jump in, let's make sure you're all set to contribute effectively and have loads of fun along the way!

> **Read this first:** `canary` is the development branch — **all pull requests
> target `canary`**, never `main`. `main` is a release snapshot that only
> receives PRs from `release/*` and `hotfix/*` branches.
> Full model: [`docs/development/branch-model.md`](./docs/development/branch-model.md).
> Repo conventions for code and tooling: [`AGENTS.md`](./AGENTS.md).

## Table of Contents

- [Fork the Repository](#fork-the-repository)
- [Clone Your Fork](#clone-your-fork)
- [Create a New Branch](#create-a-new-branch)
- [Code Like a Wizard](#code-like-a-wizard)
- [Committing Your Work](#committing-your-work)
- [Sync with Upstream](#sync-with-upstream)
- [Open a Pull Request](#open-a-pull-request)
- [Review and Collaboration](#review-and-collaboration)
- [Celebrate 🎉](#celebrate-)

## Fork the Repository

🍴 Fork this repository to your GitHub account by clicking the "Fork" button at the top right. This creates a personal copy of the project you can work on.

## Clone Your Fork

📦 Clone your forked repository to your local machine using the `git clone` command:

```bash
git clone https://github.com/YourUsername/orvilo1.git
```

## Create a New Branch

🌿 Branch off **`canary`**, not `main`. This keeps your work on the same line
everyone else is developing against.

```bash
git remote add upstream https://github.com/alexj11324/orvilo1.git
git fetch upstream canary
git checkout -b feat/your-feature-name upstream/canary
```

Use the `<type>/<feature-name>` format — `feat/`, `fix/`, `chore/`, `ci/`,
`docs/`, `refactor/`. A meaningful name makes collaboration easier!

## Code Like a Wizard

🧙‍♀️ Time to work your magic! Write code, fix bugs, or add features. Before
opening a PR, run the project's own quality gate:

```bash
bun run check
```

That runs lint and the related tests for your changed files. Add `--type` for a
scoped type-check inside the owning package (full-repo type-check runs in CI
only). See [`AGENTS.md`](./AGENTS.md) → _Quality Check_ for the full selector
set. Note this repo uses `pnpm` for dependencies and `bun` to run scripts — not
`npm` or `yarn`.

This adds a bit of enchantment to your coding experience! ✨

## Committing Your Work

📝 Ready to save your progress? Commit your changes to your branch.

```bash
git add .
git commit -m "✨ feat: your meaningful commit message"
```

Prefix your commit message with a gitmoji, and keep commits focused and clear.
Remember to be kind to your fellow contributors; keep your commits concise.

## Sync with Upstream

⚙️ Periodically, sync your fork with the original repository to stay up-to-date.
**Sync against `canary`** — that is where development happens.

```bash
git fetch upstream canary
git rebase upstream/canary
```

## Open a Pull Request

🚀 Time to share your contribution! Open a Pull Request **against `canary`**.

Direct pushes to `canary` and `main` are blocked by branch protection — a PR is
the only way in.

When you open the PR, fill in the template: screenshots for UI changes, how you
tested, and an acceptance note for user-visible behavior. Every bug fix needs a
regression test that fails before the fix and passes after it.

Our maintainers will review your work.

## Review and Collaboration

👓 Your PR will undergo thorough review and testing. The maintainers will provide feedback, and you can collaborate to make your contribution even more magical. We value teamwork!

## Celebrate 🎉

🎈 Congratulations! Your contribution is now part of Orvilo. 🥳

Thank you for making Orvilo even more magical. We can't wait to see what you create! 🌠

Happy Coding! 🚀🦄
