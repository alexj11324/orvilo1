const content = `# orvilo topic - Conversation Topic Management

Manage conversation topics (chat sessions).

## Subcommands

- \`orvilo topic list [--agent-id <id>] [-L <limit>] [--page <n>]\` - List topics with pagination
- \`orvilo topic view <id> [-L <limit>] [--from <n>] [--to <n>] [--no-messages]\` - View topic details and its messages
- \`orvilo topic search <keywords> [--agent-id <id>]\` - Search topics by keywords
- \`orvilo topic create -t <title> [--agent-id <id>] [--favorite]\` - Create a topic
- \`orvilo topic edit <id> [-t <title>] [--favorite] [--no-favorite]\` - Update topic
- \`orvilo topic delete <ids...> [--yes]\` - Delete one or more topics
- \`orvilo topic recent [-L <limit>]\` - List recently accessed topics

## Tips

- Topics are associated with agents; use \`--agent-id\` to filter
- Use \`--json\` for structured output suitable for piping
- \`orvilo topic view\` shows 50 messages per page by default; page with \`--from\` / \`--to\`, or \`--no-messages\` for metadata only
- When the prompt injects a \`<recent_topics>\` block (IM channels without a history-read API), use the \`id\` attribute with \`orvilo topic view <id>\` to read that session's full conversation
`;

export default content;
