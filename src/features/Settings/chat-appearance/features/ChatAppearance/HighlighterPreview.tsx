import { CodeBlock } from '@/components/ui/code-block';

const code = `
const person = { name: "Alice", age: 30 };
type PersonType = typeof person;  // { name: string; age: number }

// 'satisfies' to ensure a type matches but allows more specific types
type Animal = { name: string };
const dog = { name: "Buddy", breed: "Golden Retriever" } satisfies Animal;
`;

const HighlighterPreview = () => {
  return <CodeBlock code={code} language={'ts'} />;
};

export default HighlighterPreview;
