'use client';

import { Markdown } from '@lobehub/ui';
import { type SkillItem } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock, CodeBlockContent } from '@/components/ui/code-block';

const styles = {
  codeWrapper: 'relative overflow-x-auto mt-4 [padding-block-end:calc(100cqb-1lh)] [&_pre]:m-0',
  docWrapper: 'max-w-240 mx-auto py-2 px-6',
};

const getLanguage = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs': {
      return 'javascript';
    }
    case 'ts': {
      return 'typescript';
    }
    case 'tsx': {
      return 'tsx';
    }
    case 'jsx': {
      return 'jsx';
    }
    case 'py':
    case 'pyw': {
      return 'python';
    }
    case 'java': {
      return 'java';
    }
    case 'go': {
      return 'go';
    }
    case 'rs': {
      return 'rust';
    }
    case 'rb': {
      return 'ruby';
    }
    case 'sh':
    case 'bash':
    case 'zsh': {
      return 'bash';
    }
    case 'html':
    case 'htm': {
      return 'html';
    }
    case 'css': {
      return 'css';
    }
    case 'scss': {
      return 'scss';
    }
    case 'json': {
      return 'json';
    }
    case 'xml': {
      return 'xml';
    }
    case 'yaml':
    case 'yml': {
      return 'yaml';
    }
    case 'toml': {
      return 'toml';
    }
    case 'md':
    case 'mdx': {
      return 'markdown';
    }
    case 'sql': {
      return 'sql';
    }
    case 'c':
    case 'h': {
      return 'c';
    }
    case 'cpp':
    case 'cxx':
    case 'cc':
    case 'hpp': {
      return 'cpp';
    }
    case 'cs': {
      return 'csharp';
    }
    case 'swift': {
      return 'swift';
    }
    case 'kt':
    case 'kts': {
      return 'kotlin';
    }
    case 'lua': {
      return 'lua';
    }
    case 'dart': {
      return 'dart';
    }
    case 'graphql':
    case 'gql': {
      return 'graphql';
    }
    default: {
      return 'txt';
    }
  }
};

const isMarkdownFile = (path: string) => {
  const ext = path.toLowerCase().split('.').pop();
  return ext === 'md' || ext === 'mdx';
};

const parseFrontmatter = (content?: string): { body: string; frontmatter?: string } => {
  if (!content) return { body: '' };
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { body: content };
  return { body: match[2], frontmatter: match[1] };
};

interface ContentViewerProps {
  contentMap: Record<string, string>;
  liveContent?: string;
  selectedFile: string;
  skillDetail?: SkillItem;
}

const ContentViewer = memo<ContentViewerProps>(
  ({ skillDetail, selectedFile, contentMap, liveContent }) => {
    const { t } = useTranslation('setting');
    if (selectedFile === 'SKILL.md') {
      const displayContent = liveContent ?? skillDetail?.content;
      if (!displayContent) {
        return (
          <div className={styles.docWrapper}>
            <p className="text-sm leading-5.5 text-muted-foreground">
              {t('agentSkillDetail.noContent')}
            </p>
          </div>
        );
      }
      const { frontmatter, body } = parseFrontmatter(displayContent);
      return (
        <div className={styles.docWrapper}>
          {frontmatter && <CodeBlock code={frontmatter} language={'yaml'} />}
          <Markdown variant={'chat'}>{body}</Markdown>
        </div>
      );
    }

    const content = contentMap[selectedFile];

    if (isMarkdownFile(selectedFile)) {
      const { frontmatter, body } = parseFrontmatter(content);
      return (
        <div className={styles.docWrapper}>
          {frontmatter && <CodeBlock code={frontmatter} language={'yaml'} />}
          <Markdown variant={'chat'}>{body}</Markdown>
        </div>
      );
    }

    return (
      <div className={styles.codeWrapper}>
        <CodeBlock
          showLineNumbers
          code={content}
          language={getLanguage(selectedFile)}
          variant={'ghost'}
        >
          <CodeBlockContent />
        </CodeBlock>
      </div>
    );
  },
);

ContentViewer.displayName = 'ContentViewer';

export default ContentViewer;
