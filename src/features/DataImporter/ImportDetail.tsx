'use client';

import { createStaticStyles } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    duplicateAlert: css`
      margin-block-start: ${cssVar.marginMD};
      padding: ${cssVar.paddingMD};
      border: 1px solid ${cssVar.colorWarningBorder};
      border-radius: ${cssVar.borderRadiusLG};

      background-color: ${cssVar.colorWarningBg};
    `,
    duplicateDescription: css`
      margin-block-start: ${cssVar.marginXS};
      font-size: ${cssVar.fontSizeSM};
      color: ${cssVar.colorTextSecondary};
    `,
    duplicateOptions: css`
      margin-block-start: ${cssVar.marginSM};
    `,
    duplicateTag: css`
      border-color: ${cssVar.colorWarningBorder};
      color: ${cssVar.colorWarning};
      background-color: ${cssVar.colorWarningBg};
    `,
    hash: css`
      font-family: ${cssVar.fontFamilyCode};
      font-size: 12px;
      color: ${cssVar.colorTextTertiary};
    `,
    infoIcon: css`
      color: ${cssVar.colorTextSecondary};
    `,
    modalContent: css`
      padding-block: ${cssVar.paddingMD};
      padding-inline: 0;
    `,
    successIcon: css`
      color: ${cssVar.colorSuccess};
    `,
    tableContainer: css`
      overflow: hidden;
      border: 1px solid ${cssVar.colorBorderSecondary};
      border-radius: ${cssVar.borderRadiusLG};
    `,
    tableName: css`
      font-family: ${cssVar.fontFamilyCode};
    `,
    warningIcon: css`
      color: ${cssVar.colorWarning};
    `,
  };
});

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
      width={700}
      footer={[
        <Button
          key="cancel"
          onClick={() => {
            onOpenChange(false);
            onCancel();
          }}
        >
          {t('cancel')}
        </Button>,
        <Button key="confirm" variant="default" onClick={handleConfirm}>
          {t('importPreview.confirmImport')}
        </Button>,
      ]}
      onCancel={() => onOpenChange(false)}
    >
      <div className={styles.modalContent}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between" style={{ width: '100%' }}>
              <div className="flex items-center gap-2">
                <Info className={styles.infoIcon} size={16} />
                <div className="font-semibold">
                  {t('importPreview.totalRecords', { count: totalRecords })}
                </div>
              </div>
              <div className="flex">
                <div className="text-muted-foreground">
                  {t('importPreview.totalTables', { count: tables.length })}
                </div>
              </div>
            </div>
            <div className={cn('flex gap-1', styles.hash)}>
              {t('importPreview.hashLabel')}: <span>{importData.schemaHash}</span>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <div style={{ maxHeight: 350, overflowY: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('importPreview.tables.name')}</TableHead>
                    <TableHead>{t('importPreview.tables.count')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell>
                        <div className={styles.tableName}>{table.name}</div>
                      </TableCell>
                      <TableCell>{table.count}</TableCell>
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
