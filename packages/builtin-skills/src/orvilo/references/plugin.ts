const content = `# orvilo plugin - Plugin Management

Manage installed plugins (external tool integrations).

## Subcommands

- \`orvilo plugin list\` - List installed plugins
- \`orvilo plugin install -i <identifier> [--manifest <url>] [--type <type>] [--settings <json>]\` - Install plugin
- \`orvilo plugin uninstall <id> [--yes]\` - Uninstall plugin
- \`orvilo plugin update <id> [--manifest <url>] [--settings <json>]\` - Update plugin

## Tips

- Plugins extend agent capabilities with external tools
- Use \`--settings\` to pass JSON configuration during install/update
`;

export default content;
