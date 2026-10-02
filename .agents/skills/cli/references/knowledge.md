# Knowledge Base, File & Document Commands

## Knowledge Base (`orvilo kb`)

Manage knowledge bases for RAG (Retrieval-Augmented Generation). Supports directory tree structure with folders, documents, and file uploads.

**Source**: `apps/cli/src/commands/kb.ts`

### `orvilo kb list`

```bash
orvilo kb list [--json [fields]]
```

**Table columns**: ID, NAME, DESCRIPTION, UPDATED

### `orvilo kb view <id>`

```bash
orvilo kb view [fields]] < id > [--json
```

**Displays**: Name, description, full directory tree with all files and documents (recursively fetched). Shows indented tree structure with item type (File/Doc), file type, and size.

**API**: Uses `file.getKnowledgeItems` to recursively fetch items. Folders (`custom/folder` fileType) are traversed in parallel via `Promise.all` for performance.

### `orvilo kb create`

```bash
orvilo kb create -n [--avatar < name > [-d < desc > ] < url > ]
```

| Option                     | Description         | Required |
| -------------------------- | ------------------- | -------- |
| `-n, --name <name>`        | Knowledge base name | Yes      |
| `-d, --description <desc>` | Description         | No       |
| `--avatar <url>`           | Avatar URL          | No       |

**Output**: Created KB ID. Note: backend returns ID as a string directly (not an object).

### `orvilo kb edit <id>`

```bash
orvilo kb edit [-d [--avatar < id > [-n < name > ] < desc > ] < url > ]
```

Requires at least one change flag. Errors if none specified.

### `orvilo kb delete <id>`

```bash
orvilo kb delete [--yes] < id > [--remove-files]
```

| Option           | Description                  |
| ---------------- | ---------------------------- |
| `--remove-files` | Also delete associated files |
| `--yes`          | Skip confirmation            |

### `orvilo kb add-files <knowledgeBaseId>`

```bash
orvilo kb add-files <kbId> --ids <fileId1> <fileId2> ...
```

Link existing files to a knowledge base.

### `orvilo kb remove-files <knowledgeBaseId>`

```bash
orvilo kb remove-files <kbId> --ids <fileId1> <fileId2> ... [--yes]
```

Unlink files from a knowledge base.

### `orvilo kb mkdir <knowledgeBaseId>`

```bash
orvilo kb mkdir < kbId > -n < name > [--parent < folderId > ]
```

Create a folder in a knowledge base. Uses `document.createDocument` with `fileType: 'custom/folder'`.

| Option                | Description      | Required |
| --------------------- | ---------------- | -------- |
| `-n, --name <name>`   | Folder name      | Yes      |
| `--parent <parentId>` | Parent folder ID | No       |

### `orvilo kb create-doc <knowledgeBaseId>`

```bash
orvilo kb create-doc [--parent < kbId > -t < title > [-c < content > ] < folderId > ]
```

Create a document in a knowledge base. Uses `document.createDocument` with `fileType: 'custom/document'`.

| Option                 | Description      | Required |
| ---------------------- | ---------------- | -------- |
| `-t, --title <title>`  | Document title   | Yes      |
| `-c, --content <text>` | Document content | No       |
| `--parent <parentId>`  | Parent folder ID | No       |

### `orvilo kb move <id>`

```bash
orvilo kb move < id > --type < file | doc > [--parent < folderId > ]
```

Move a file or document to a different folder (or to root if `--parent` is omitted).

| Option                | Description                      | Default |
| --------------------- | -------------------------------- | ------- |
| `--type <type>`       | Item type: `file` or `doc`       | `file`  |
| `--parent <parentId>` | Target folder ID (omit for root) | -       |

Uses `document.updateDocument` for docs, `file.updateFile` for files.

### `orvilo kb upload <knowledgeBaseId> <filePath>`

```bash
orvilo kb upload <kbId> <filePath> [--parent <folderId>]
```

Upload a local file to a knowledge base via S3 presigned URL.

| Option                | Description      |
| --------------------- | ---------------- |
| `--parent <parentId>` | Parent folder ID |

**Flow**: Compute SHA-256 hash → get presigned URL via `upload.createS3PreSignedUrl` → PUT to S3 → create file record via `file.createFile`.

---

## File Management (`orvilo file`)

Manage uploaded files.

**Source**: `apps/cli/src/commands/file.ts`

### `orvilo file list`

```bash
orvilo file list [--kb-id [-L [--json [fields]] < id > ] < n > ]
```

| Option            | Description              | Default |
| ----------------- | ------------------------ | ------- |
| `--kb-id <id>`    | Filter by knowledge base | -       |
| `-L, --limit <n>` | Maximum items            | `30`    |

**Table columns**: ID, NAME, TYPE, SIZE, UPDATED

### `orvilo file view <id>`

```bash
orvilo file view [fields]] < id > [--json
```

**Displays**: Name, type, size, chunking status, embedding status.

### `orvilo file delete <ids...>`

```bash
orvilo file delete [--yes] < id1 > [id2...]
```

Supports deleting multiple files at once.

### `orvilo file recent`

```bash
orvilo file recent [-L [--json [fields]] < n > ]
```

| Option            | Description     | Default |
| ----------------- | --------------- | ------- |
| `-L, --limit <n>` | Number of items | `10`    |

---

## Document Management (`orvilo doc`)

Manage text documents (notes, wiki pages).

**Source**: `apps/cli/src/commands/doc.ts`

### `orvilo doc list`

```bash
orvilo doc list [-L [--file-type [--source-type [--json [fields]] < n > ] < type > ] < type > ]
```

| Option                 | Description                                   | Default |
| ---------------------- | --------------------------------------------- | ------- |
| `-L, --limit <n>`      | Maximum items                                 | `30`    |
| `--file-type <type>`   | Filter by file type                           | -       |
| `--source-type <type>` | Filter by source type (file, web, api, topic) | -       |

**Table columns**: ID, TITLE, TYPE, UPDATED

### `orvilo doc view <id>`

```bash
orvilo doc view [fields]] < id > [--json
```

**Displays**: Title, type, KB association, updated time, full content.

### `orvilo doc create`

```bash
orvilo doc create -t [-F [--parent [--slug [--kb [--file-type < title > [-b < body > ] < path > ] < id > ] < slug > ] < id > ] < type > ]
```

| Option                   | Description                                     | Required |
| ------------------------ | ----------------------------------------------- | -------- |
| `-t, --title <title>`    | Document title                                  | Yes      |
| `-b, --body <content>`   | Document body text                              | No       |
| `-F, --body-file <path>` | Read body from file                             | No       |
| `--parent <id>`          | Parent document ID                              | No       |
| `--slug <slug>`          | Custom URL slug                                 | No       |
| `--kb <id>`              | Knowledge base ID to associate with             | No       |
| `--file-type <type>`     | File type (e.g. custom/document, custom/folder) | No       |

`-b` and `-F` are mutually exclusive; `-F` reads the file content as the body.

### `orvilo doc batch-create <file>`

Batch create documents from a JSON file. The file must contain a non-empty array of document objects.

```bash
orvilo doc batch-create documents.json
```

Each object in the array can have: `title`, `content`, `fileType`, `knowledgeBaseId`, `parentId`, `slug`.

### `orvilo doc edit <id>`

```bash
orvilo doc edit [-b [-F [--parent [--file-type < id > [-t < title > ] < body > ] < path > ] < id > ] < type > ]
```

### `orvilo doc delete <ids...>`

```bash
orvilo doc delete [--yes] < id1 > [id2...]
```

### `orvilo doc parse <fileId>`

Parse an uploaded file into a document.

```bash
orvilo doc parse [--json [fields]] < fileId > [--with-pages]
```

| Option         | Description             |
| -------------- | ----------------------- |
| `--with-pages` | Preserve page structure |

**Output**: Parsed title and content preview.

### `orvilo doc link-topic <docId> <topicId>`

Associate a document with a topic. Creates a linked copy via the notebook router.

```bash
orvilo doc link-topic <docId> <topicId>
```

### `orvilo doc topic-docs <topicId>`

List documents associated with a topic.

```bash
orvilo doc topic-docs [--json [fields]] < topicId > [--type < type > ]
```

| Option          | Description                                      |
| --------------- | ------------------------------------------------ |
| `--type <type>` | Filter by type (article, markdown, note, report) |
