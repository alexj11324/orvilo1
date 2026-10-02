const content = `# orvilo agent - Agent Management

Manage agents (AI assistants with custom configurations).

## Subcommands

- \`orvilo agent list [-L <limit>] [-k <keyword>]\` - List agents
- \`orvilo agent view [agentId] [-s <slug>]\` - View agent configuration
- \`orvilo agent create -t <title> [-d <description>] [-m <model>] [-p <provider>] [-s <systemRole>]\` - Create agent
- \`orvilo agent edit [agentId] [-t <title>] [-d <description>] [-m <model>] [-s <systemRole>] [--config-file <path>] [--json]\` - Update agent
- \`orvilo agent delete <agentId> [--yes]\` - Delete agent
- \`orvilo agent duplicate <agentId> [-t <title>]\` - Duplicate agent
- \`orvilo agent run -a <agentId> -p <prompt> [-t <topicId>] [--replay]\` - Run agent with a prompt
- \`orvilo agent status <operationId> [--history]\` - Check agent operation status

## Editing your own configuration

You can edit yourself: pass your own agent id (already given to you in the
identity table) to \`orvilo agent edit\`.

Fields without a dedicated flag (\`openingMessage\`, \`openingQuestions\`, \`tags\`,
\`avatar\`, \`backgroundColor\`, \`params\`, \`chatConfig\`, …) go through
\`--config-file\`, which is deep-merged into the existing config — omitted keys
are kept:

\`\`\`bash
echo '{"openingMessage":"Hi! Ask me about deploys.","tags":["devops"]}' > /tmp/cfg.json
orvilo agent edit <agentId> --config-file /tmp/cfg.json --json
\`\`\`

Identity fields (\`id\`, \`slug\`, \`userId\`, \`workspaceId\`, \`visibility\`) are
rejected by the server — use the dedicated commands for those.

Add \`--json\` to get the updated agent back, so you can confirm the change
actually landed instead of assuming it did.

## Tips

- Use \`--slug\` to reference agents by slug instead of ID
- \`orvilo agent run --replay\` replays the full conversation output
- \`orvilo agent status --history\` shows operation execution history
- Commands run in the same workspace as you. \`orvilo whoami\` prints that scope —
  check it first if an agent, topic or file you expect to exist reports "not found"
`;

export default content;
