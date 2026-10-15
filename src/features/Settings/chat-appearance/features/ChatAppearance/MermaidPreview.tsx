import { Mermaid, type MermaidProps } from '@/components/Mermaid';

const code = `sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!
`;

const MermaidPreview = ({ theme }: { theme?: MermaidProps['theme'] }) => {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center">
      <div className="flex w-120 max-w-full min-w-0 flex-col">
        <Mermaid theme={theme}>{code}</Mermaid>
      </div>
    </div>
  );
};

export default MermaidPreview;
