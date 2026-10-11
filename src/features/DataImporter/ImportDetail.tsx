'use client';

import { cn } from 'cn';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ImportPgDataStructure } from '@/types/export';

const getNonEmptyTables = (data: ImportPgDataStructure) => {
  const result = [];

  for (const [key, value] of Object.entries(data.data)) {
    if (Array.isArray(value) && value.length > 0) {
      result.push({
        count: value.length,
        name: key,
      });
    }
  }

  return result;
};

const getTotalRecords = (tables: { count: number; name: string }[]): number => {
  return tables.reduce((sum, table) => sum + table.count, 0);
};

const styles = {
  duplicateAlert: 'mbs-4 p-4 border border-warning-border rounded-(--radius-card) bg-warning-wash',
  duplicateDescription: 'mbs-2 text-xs leading-5 text-muted-foreground',
  duplicateOptions: 'mbs-3',
  duplicateTag: 'border-warning-border text-warning-text bg-warning-wash',
  hash: 'font-mono text-xs leading-5 text-foreground-tertiary',
  infoIcon: 'text-muted-foreground',
  modalContent: 'py-4 px-0',
  successIcon: 'text-success-text',
  tableContainer: 'overflow-hidden border border-divider rounded-(--radius-card)',
  tableName: 'font-mono',
  warningIcon: 'text-warning-text',
};

interface ImportPreviewModalProps {
  importData: ImportPgDataStructure;
  onCancel?: () => void;
  onConfirm?: (overwriteExisting: boolean) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const ImportPreviewModal = ({
  open = true,
  onOpenChange = () => {},
  onConfirm = () => {},
  onCancel = () => {},
  importData,
}: ImportPreviewModalProps) => {
  const { t } = useTranslation('common');
  const [duplicateAction] = useState<string>('skip');
  const tables = getNonEmptyTables(importData);
  const totalRecords = getTotalRecords(tables);

  const handleConfirm = () => {
    onConfirm(duplicateAction === 'overwrite');
    onOpenChange(false);
  };

  return (
    <ImperativeModal
      open={open}
      title={t('importPreview.title')}
      width={640}
      footer={[
        <Button
          className="leading-5.5"
          key="cancel"
          size="lg"
          onClick={() => {
            onOpenChange(false);
            onCancel();
          }}
        >
          {t('cancel')}
        </Button>,
        <Button
          className="leading-5.5"
          key="confirm"
          size="lg"
          variant="default"
          onClick={handleConfirm}
        >
          {t('importPreview.confirmImport')}
        </Button>,
      ]}
      onCancel={() => onOpenChange(false)}
    >
      <div className={styles.modalContent}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Info className={styles.infoIcon} size={16} />
                <div className="text-sm leading-5.5 font-semibold">
                  {t('importPreview.totalRecords', { count: totalRecords })}
                </div>
              </div>
              <div className="flex">
                <div className="text-xs leading-5 text-muted-foreground">
                  {t('importPreview.totalTables', { count: tables.length })}
                </div>
              </div>
            </div>
            <div className={cn('flex gap-1', styles.hash)}>
              {t('importPreview.hashLabel')}: <span>{importData.schemaHash}</span>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <div className="max-h-87.5 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky inset-bs-0 z-10 h-8 bg-background">
                      {t('importPreview.tables.name')}
                    </TableHead>
                    <TableHead className="sticky inset-bs-0 z-10 h-8 bg-background">
                      {t('importPreview.tables.count')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="py-1.5">
                        <div className={styles.tableName}>{table.name}</div>
                      </TableCell>
                      <TableCell className="py-1.5">{table.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </ImperativeModal>
  );
};

export default ImportPreviewModal;
