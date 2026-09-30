import {
  SiBun,
  SiDocker,
  SiNodedotjs,
  SiNpm,
  SiPnpm,
  SiPython,
} from '@icons-pack/react-simple-icons';
import { type ComponentProps, type FC } from 'react';
import { memo } from 'react';

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from '@/components/reui/autocomplete';

import { parseCommandInput } from './parseCommandInput';

// Define preset command options
const STDIO_COMMAND_OPTIONS: {
  // Assuming icon is a React function component
  color?: string;
  icon?: FC<{ color?: string; size?: number }>;
  value: string;
}[] = [
  { color: '#CB3837', icon: SiNpm, value: 'npx' },
  { color: '#CB3837', icon: SiNpm, value: 'npm' },
  { color: '#F69220', icon: SiPnpm, value: 'pnpm' },
  { color: '#F69220', icon: SiPnpm, value: 'pnpx' },
  { color: '#339933', icon: SiNodedotjs, value: 'node' },
  { color: '#efe2d2', icon: SiBun, value: 'bun' },
  { color: '#efe2d2', icon: SiBun, value: 'bunx' },
  { color: '#DE5FE9', icon: SiPython, value: 'uv' },
  { color: '#3776AB', icon: SiPython, value: 'python' },
  { color: '#2496ED', icon: SiDocker, value: 'docker' },
];

interface MCPStdioCommandInputProps extends Omit<
  ComponentProps<typeof AutocompleteInput>,
  'onChange' | 'value'
> {
  onChange?: (value: string) => void;
  onParsedArgs?: (args: string[]) => void;
  value?: string;
}

const MCPStdioCommandInput = memo<MCPStdioCommandInputProps>(
  ({ onParsedArgs, onChange, value, ...props }) => {
    const handleBlur = () => {
      if (typeof value !== 'string') return;
      const parsed = parseCommandInput(value);
      if (!parsed) return;

      onChange?.(parsed.command);
      if (parsed.args.length > 0) onParsedArgs?.(parsed.args);
    };

    return (
      <div style={{ display: 'contents' }} onBlur={handleBlur}>
        <Autocomplete
          items={STDIO_COMMAND_OPTIONS.map((option) => option.value)}
          value={value}
          onValueChange={onChange}
        >
          <AutocompleteInput
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            {...props}
          />
          <AutocompleteContent>
            <AutocompleteList>
              {STDIO_COMMAND_OPTIONS.map(({ value, icon: Icon, color }) => (
                <AutocompleteItem key={value} value={value}>
                  <div className={'flex gap-2 items-center'}>
                    {Icon && <Icon color={color} size={16} />}
                    {value}
                  </div>
                </AutocompleteItem>
              ))}
            </AutocompleteList>
          </AutocompleteContent>
        </Autocomplete>
      </div>
    );
  },
);

export default MCPStdioCommandInput;
