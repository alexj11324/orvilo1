const content = `# orvilo kb - Knowledge Base Management

Manage knowledge bases, folders, documents, and files.

## Subcommands

- \`orvilo kb list\` - List all knowledge bases
- \`orvilo kb view <id>\` - View KB with all items in tree structure
- \`orvilo kb create -n <name> [-d <description>]\` - Create a knowledge base
- \`orvilo kb edit <id> [-n <name>] [-d <description>]\` - Update KB metadata
- \`orvilo kb delete <id> [--remove-files] [--yes]\` - Delete a knowledge base
- \`orvilo kb add-files <kbId> --ids <fileId1,fileId2>\` - Add files to KB
- \`orvilo kb remove-files <kbId> --ids <fileId1,fileId2>\` - Remove files from KB
- \`orvilo kb mkdir <kbId> -n <name> [--parent <folderId>]\` - Create a folder
- \`orvilo kb create-doc <kbId> -t <title> -c <content> [--parent <folderId>]\` - Create a document in KB
- \`orvilo kb move <id> --parent <folderId> --type <file|doc>\` - Move file/document to folder
- \`orvilo kb upload <kbId> <filePath> [--parent <folderId>]\` - Upload file to KB

## Tips

- Use \`--json\` on any subcommand for structured output
- \`orvilo kb view\` shows a full tree of folders, files, and documents
- After uploading a file, use \`orvilo doc parse <fileId>\` to extract text content
`;

export default content;
