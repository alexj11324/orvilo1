import { CodeDiff } from '@lobehub/ui';
import type { EditLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import path from 'path-browserify-esm';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalFile, LocalFolder } from '@/features/LocalFile';
import { localFileService } from '@/services/electron/localFileService';

import OutOfScopeWarning from '../OutOfScopeWarning';

const EditLocalFile = memo<BuiltinInterventionProps<EditLocalFileParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { base, dir } = path.parse(args.file_path);

  // Fetch full file content
  const { data: fileData, isLoading } = useSWR(
    ['readLocalFile', args.file_path],
    () => localFileService.readLocalFile({ fullContent: true, path: args.file_path }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Generate new content by applying the replacement.
  //
  // A single-occurrence edit whose old_string matches more than once is
  // refused by the runtime, so previewing `String.replace`'s first-match result
  // would show the user a concrete diff to approve that can never be applied.
  // Count the matches and say so instead.
  const { oldContent, newContent, matchCount } = useMemo(() => {
    if (!fileData?.content) return { matchCount: 0, newContent: '', oldContent: '' };

    const oldContent = fileData.content;
    const matchCount = args.old_string ? oldContent.split(args.old_string).length - 1 : 0;

    if (!args.replace_all && matchCount > 1) {
      return { matchCount, newContent: oldContent, oldContent };
    }

    const newContent = args.replace_all
      ? oldContent.replaceAll(args.old_string, args.new_string)
      : oldContent.replace(args.old_string, args.new_string);

    return { matchCount, newContent, oldContent };
  }, [fileData?.content, args.old_string, args.new_string, args.replace_all]);

  const isAmbiguous = !args.replace_all && matchCount > 1;

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={[args.file_path]} />
      <div className="flex flex-row">
        <LocalFolder path={dir} />
        <span className="anticon" role="img">
          <ChevronRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <LocalFile name={base} path={args.file_path} />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton className="h-4" key={i} style={{ width: i === 2 ? '60%' : '100%' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {isAmbiguous ? (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                {t('localFiles.editFile.ambiguous', { times: matchCount })}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="text-muted-foreground">
                {args.replace_all
                  ? t('localFiles.editFile.replaceAll')
                  : t('localFiles.editFile.replaceFirst')}
              </div>
              {oldContent && (
                <CodeDiff
                  fileName={args.file_path}
                  newContent={newContent}
                  oldContent={oldContent}
                  showHeader={false}
                  variant="borderless"
                  viewMode="split"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

EditLocalFile.displayName = 'EditLocalFileIntervention';

export default EditLocalFile;
