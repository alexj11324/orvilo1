const content = `# orvilo file - File Management

Manage uploaded files.

## Subcommands

- \`orvilo file list [--kb-id <id>] [-L <limit>]\` - List files (optionally filter by knowledge base)
- \`orvilo file view <id>\` - View file details
- \`orvilo file delete <ids...> [--yes]\` - Delete one or more files
- \`orvilo file recent [-L <limit>]\` - List recently accessed files

## Tips

- Files can be associated with knowledge bases
- Use \`orvilo kb upload\` to upload new files to a knowledge base
`;

export default content;
