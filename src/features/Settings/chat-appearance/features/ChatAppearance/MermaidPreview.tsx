import { type MermaidProps } from '@lobehub/ui';
import { Mermaid } from '@lobehub/ui';

const code = `sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!
`;

const MermaidPreview = ({ theme }: { theme?: MermaidProps['theme'] }) => {
  return (
    <div
      className={'flex min-w-0'}
      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'column', width: 480, maxWidth: '100%' }}
      >
        <Mermaid theme={theme}>{code}</Mermaid>
      </div>
    </div>
  );
};

export default MermaidPreview;
