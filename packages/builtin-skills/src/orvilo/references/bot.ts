const content = `# orvilo bot - Bot Integration Management

Manage bot integrations that connect agents to messaging platforms.

## Supported Platforms

Discord, Slack, Telegram, Lark, Feishu

## Subcommands

- \`orvilo bot list [-a <agentId>] [--platform <p>]\` - List bot integrations
- \`orvilo bot view <botId> [-a <agentId>]\` - View bot details
- \`orvilo bot add -a <agentId> --platform <p> [--bot-token <t>] [--app-id <id>]\` - Add bot to agent
- \`orvilo bot update <botId> [--bot-token <t>] [--platform <p>]\` - Update bot credentials
- \`orvilo bot remove <botId> [--yes]\` - Remove bot integration
- \`orvilo bot enable <botId>\` - Enable bot
- \`orvilo bot disable <botId>\` - Disable bot
- \`orvilo bot connect <botId> [-a <agentId>]\` - Connect and start bot

## Message Subcommands

- \`orvilo bot message send <botId> --target <channelId> --message <text> [--reply-to <messageId>] [--json]\` - Send a message
- \`orvilo bot message read <botId> --target <channelId> [--limit <n>] [--before <messageId>] [--after <messageId>] [--json]\` - Read messages from a channel
- \`orvilo bot message edit <botId> --target <channelId> --message-id <id> --message <text>\` - Edit a message
- \`orvilo bot message delete <botId> --target <channelId> --message-id <id> [--yes]\` - Delete a message
- \`orvilo bot message search <botId> --target <channelId> --query <text> [--author-id <id>] [--limit <n>] [--json]\` - Search messages
- \`orvilo bot message react <botId> --target <channelId> --message-id <id> --emoji <emoji>\` - Add reaction
- \`orvilo bot message reactions <botId> --target <channelId> --message-id <id> [--json]\` - List reactions
- \`orvilo bot message pin <botId> --target <channelId> --message-id <id>\` - Pin a message
- \`orvilo bot message unpin <botId> --target <channelId> --message-id <id>\` - Unpin a message
- \`orvilo bot message pins <botId> --target <channelId> [--json]\` - List pinned messages
- \`orvilo bot message poll <botId> --target <channelId> --poll-question <text> --poll-option <opt> [--poll-multi] [--poll-duration-hours <n>]\` - Create a poll
- \`orvilo bot message thread create <botId> --target <channelId> --thread-name <name> [--message <text>] [--message-id <id>]\` - Create thread
- \`orvilo bot message thread list <botId> --target <channelId> [--json]\` - List threads
- \`orvilo bot message thread reply <botId> --thread-id <id> --message <text>\` - Reply to thread
- \`orvilo bot message channel list <botId> [--server-id <id>] [--filter <type>] [--json]\` - List channels
- \`orvilo bot message channel info <botId> --target <channelId> [--json]\` - Get channel info
- \`orvilo bot message member info <botId> --member-id <id> [--server-id <id>] [--json]\` - Get member info

## Tips

- Each platform requires specific credentials (token, app ID, secrets)
- Use \`orvilo bot connect\` to start a long-running bot connection
- Use \`orvilo bot message read\` with \`--json\` for batch message retrieval — ideal for processing large volumes of messages
- For step-by-step platform setup instructions, read the platform-specific reference under \`references/bot/\`: \`discord\`, \`telegram\`, \`slack\`, \`feishu\`, \`lark\`, \`qq\`, \`wechat\`
`;

export default content;
