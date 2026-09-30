'use client';

import { Table } from 'antd';
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

  const cellRender = (text: string) => {
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
                <Table
                  bordered
                  dataSource={dataSource}
                  pagination={false}
                  rowKey={'title'}
                  size={'small'}
                  columns={[
                    { dataIndex: 'title', render: cellRender, title: t('importModal.result.type') },
                    {
                      dataIndex: 'added',
                      render: cellRender,
                      title: t('importModal.result.added'),
                    },
                    {
                      dataIndex: 'skips',
                      render: cellRender,
                      title: t('importModal.result.skips'),
                    },
                    {
                      dataIndex: 'error',
                      render: cellRender,
                      title: t('importModal.result.errors'),
                    },
                    {
                      dataIndex: 'updated',
                      render: cellRender,
                      title: t('importModal.result.update'),
                    },
                  ]}
                />
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
