import { CheckCircle, ChevronRight } from 'lucide-react';
import { memo } from 'react';

interface ConfigDiffViewProps {
  newValues: Record<string, unknown>;
  previousValues: Record<string, unknown>;
  updatedFields: string[];
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) return `[${value.map(formatValue).join(', ')}]`;
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

const ConfigDiffView = memo<ConfigDiffViewProps>(({ updatedFields, previousValues, newValues }) => {
  if (updatedFields.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" style={{ fontSize: 13 }}>
      <div className="flex items-center gap-[6px]" style={{ color: 'var(--lobe-success-6)' }}>
        <CheckCircle size={14} />
        <span style={{ fontWeight: 500 }}>Updated {updatedFields.length} field(s)</span>
      </div>

      <div className="flex flex-col gap-2" style={{ marginLeft: 20 }}>
        {updatedFields.map((field) => {
          const oldValue = previousValues[field];
          const newValue = newValues[field];

          return (
            <div className="flex flex-col gap-1" key={field}>
              <span style={{ color: 'var(--lobe-text-secondary)', fontWeight: 500 }}>{field}:</span>
              <div className="flex items-center gap-2" style={{ marginLeft: 12 }}>
                <span
                  style={{
                    color: 'var(--lobe-text-tertiary)',
                    opacity: 0.7,
                    textDecoration: 'line-through',
                  }}
                >
                  {formatValue(oldValue)}
                </span>
                <ChevronRight
                  size={12}
                  style={{ color: 'var(--lobe-text-tertiary)', opacity: 0.5 }}
                />
                <span style={{ color: 'var(--lobe-success-6)', fontWeight: 500 }}>
                  {formatValue(newValue)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default ConfigDiffView;
