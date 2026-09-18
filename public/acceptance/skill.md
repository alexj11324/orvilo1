# Install Acceptance for Orvilo

Acceptance lets a coding agent verify a delivery and publish evidence for human review in Orvilo.
Run the following setup from the root of the project the user wants to verify.

## 1. Install the CLI

If `lh --version` is unavailable, install the Orvilo CLI:

```sh
npm install -g @orvilo/cli
```

## 2. Connect to Orvilo

Check the current account with `lh whoami`. If authentication is needed, run:

```sh
lh login
```

Let the user complete the browser sign-in. Never request passwords or tokens in chat.

## 3. Install the Acceptance skill

The Acceptance skill ships vendored in the Orvilo repository — server-side
bundle distribution (`lh acceptance install`) is retired. Copy it into the
project root:

```sh
git clone --depth 1 https://github.com/alexj11324/orvilo1 /tmp/orvilo-skill
mkdir -p .agents/skills
cp -R /tmp/orvilo-skill/.agents/skills/acceptance .agents/skills/acceptance
```

The copy is a materialized artifact — commit it so the project's own reviews
see skill changes like any other file.

## 4. Verify setup and start a review

Confirm that `.agents/skills/acceptance/SKILL.md` exists, read it, and follow its
instructions and referenced resources. Do not replace it with this installation guide.

Tell the user which project was configured and whether installation completed.
The user can then invoke `/acceptance` in their coding agent to verify a delivery.
Published reviews appear at <https://orvilo.aspectlylabs.com/acceptance>.
