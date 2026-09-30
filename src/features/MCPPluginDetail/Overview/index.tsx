import { Markdown } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { useDetailContext } from '../DetailProvider';
import TagList from './TagList';

const Overview = memo<{ inModal?: boolean }>(() => {
  const { t } = useTranslation('discover');
  const { tags = [], description, overview } = useDetailContext();

  const summary = overview?.summary || description;

  return (
    <div className="flex flex-col gap-12">
      <Accordion multiple defaultValue={['summary']}>
        <AccordionItem className="rounded-xl border" value={'summary'}>
          <AccordionTrigger className="px-4 py-3">
            {t('mcp.details.summary.title')}
          </AccordionTrigger>
          <AccordionContent className="px-4 py-3">
            {!!summary ? <Markdown>{summary}</Markdown> : summary}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="flex flex-col gap-4">
        {overview?.readme && (
          <Markdown allowHtml enableImageGallery={false} enableLatex={false}>
            {overview.readme.trimEnd()}
          </Markdown>
        )}
        <TagList tags={tags} />
      </div>
    </div>
  );
});

export default Overview;
