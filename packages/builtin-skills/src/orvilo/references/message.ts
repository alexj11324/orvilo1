const content = `# orvilo message - Message Management

Manage chat messages.

## Subcommands

- \`orvilo message list [--topic-id <id>] [--agent-id <id>] [-L <limit>] [--page <n>]\` - List messages
- \`orvilo message search <keywords>\` - Search messages by keywords
- \`orvilo message delete <ids...> [--yes]\` - Delete messages
- \`orvilo message count [--start <date>] [--end <date>]\` - Count messages
- \`orvilo message heatmap\` - Get message activity heatmap

## Tips

- Filter by \`--topic-id\` to get messages from a specific conversation
- Use \`--user\` flag to filter by message role (user/assistant)
`;

export default content;
