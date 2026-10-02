const content = `# orvilo skill - Skill Management

Manage agent skills (reusable prompt+resource bundles).

## Subcommands

- \`orvilo skill list [--source <builtin|market|user>]\` - List skills
- \`orvilo skill view <id>\` - View skill details
- \`orvilo skill create -n <name> -d <description> -c <content>\` - Create user skill
- \`orvilo skill edit <id> [-c <content>] [-n <name>] [-d <description>]\` - Update skill
- \`orvilo skill delete <id> [--yes]\` - Delete skill
- \`orvilo skill search <query>\` - Search skills
- \`orvilo skill install <source> [--branch <b>]\` - Install from GitHub/URL/marketplace
- \`orvilo skill resources <id>\` - List skill resource files
- \`orvilo skill read-resource <id> <path>\` - Read a skill resource file

## Tips

- Skills can be installed from GitHub repos, URLs, or the marketplace
- Use \`resources\` and \`read-resource\` to inspect skill reference files
`;

export default content;
