'use client';

import { createStaticStyles } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    zeroCell: css`
      color: ${cssVar.colorTextQuaternary};
    `,
  };
});

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
    return text ? text : <span className={styles.zeroCell}>0</span>;
  };
  return (
    <Empty style={{ paddingBlock: 24, paddingInline: 0 }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CheckCircle className="text-success" />
        </EmptyMedia>
        <EmptyTitle>{t('importModal.finish.title')}</EmptyTitle>
        <EmptyDescription>
          {
            // if there is no importData, means it's only import the settings
            !dataSource ? (
              t('importModal.finish.onlySettings')
            ) : (
              <div className="flex flex-col gap-4" style={{ width: 500 }}>
                {t('importModal.finish.subTitle', { duration: (duration / 1000).toFixed(2) })}
                <Table className="border-collapse border">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 border">{t('importModal.result.type')}</TableHead>
                      <TableHead className="h-8 border">{t('importModal.result.added')}</TableHead>
                      <TableHead className="h-8 border">{t('importModal.result.skips')}</TableHead>
                      <TableHead className="h-8 border">{t('importModal.result.errors')}</TableHead>
                      <TableHead className="h-8 border">{t('importModal.result.update')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSource.map((row) => (
                      <TableRow key={row.title}>
                        <TableCell className="border py-1.5">{cellRender(row.title)}</TableCell>
                        <TableCell className="border py-1.5">{cellRender(row.added)}</TableCell>
                        <TableCell className="border py-1.5">{cellRender(row.skips)}</TableCell>
                        <TableCell className="border py-1.5">{cellRender(row.error)}</TableCell>
                        <TableCell className="border py-1.5">{cellRender(row.updated)}</TableCell>
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
        <Button size="lg" variant="default" onClick={onClickFinish}>
          {t('importModal.finish.start')}
        </Button>
      </EmptyContent>
    </Empty>
  );
});

export default SuccessResult;
