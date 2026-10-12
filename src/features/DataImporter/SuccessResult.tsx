'use client';

import { CheckCircle } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const styles = {
  zeroCell: 'text-foreground-quaternary',
};

interface SuccessResultProps {
  dataSource?: {
    added: number;
    error: number;
    skips: number;
    title: string;
    updated: number;
  }[];
  duration: number;
  onClickFinish?: () => void;
}

const SuccessResult = memo<SuccessResultProps>(({ duration, dataSource, onClickFinish }) => {
  const { t } = useTranslation('common');

  const cellRender = (text: number | string) => {
    return text || <span className={styles.zeroCell}>0</span>;
  };
  return (
    <Empty className="py-6 px-0 rounded-(--radius-card)">
      <EmptyHeader className="w-full max-w-none">
        <EmptyMedia className="rounded-(--radius-card)" variant="icon">
          <CheckCircle className="text-success-text" />
        </EmptyMedia>
        <EmptyTitle className="text-base leading-6 font-semibold">
          {t('importModal.finish.title')}
        </EmptyTitle>
        <EmptyDescription className="min-w-0 max-w-full text-sm leading-5.5">
          {
            // if there is no importData, means it's only import the settings
            !dataSource ? (
              t('importModal.finish.onlySettings')
            ) : (
              <div className="flex flex-col gap-4 w-125 max-w-full">
                {t('importModal.finish.subTitle', { duration: (duration / 1000).toFixed(2) })}
                <Table className="border-collapse border border-divider text-sm leading-5.5">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 border border-divider">
                        {t('importModal.result.type')}
                      </TableHead>
                      <TableHead className="h-8 border border-divider">
                        {t('importModal.result.added')}
                      </TableHead>
                      <TableHead className="h-8 border border-divider">
                        {t('importModal.result.skips')}
                      </TableHead>
                      <TableHead className="h-8 border border-divider">
                        {t('importModal.result.errors')}
                      </TableHead>
                      <TableHead className="h-8 border border-divider">
                        {t('importModal.result.update')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSource.map((row) => (
                      <TableRow key={row.title}>
                        <TableCell className="border border-divider py-1.5">
                          {cellRender(row.title)}
                        </TableCell>
                        <TableCell className="border border-divider py-1.5">
                          {cellRender(row.added)}
                        </TableCell>
                        <TableCell className="border border-divider py-1.5">
                          {cellRender(row.skips)}
                        </TableCell>
                        <TableCell className="border border-divider py-1.5">
                          {cellRender(row.error)}
                        </TableCell>
                        <TableCell className="border border-divider py-1.5">
                          {cellRender(row.updated)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          }
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button className="leading-5.5" size="lg" variant="default" onClick={onClickFinish}>
          {t('importModal.finish.start')}
        </Button>
      </EmptyContent>
    </Empty>
  );
});

export default SuccessResult;
