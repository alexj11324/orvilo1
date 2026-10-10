import { Puzzle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const styles = {
  container: 'flex flex-col gap-3 items-center justify-center w-full h-full p-6',
  description: 'text-sm leading-5.5 text-muted-foreground text-center',
  iconWrapper: 'flex items-center justify-center size-16 rounded-full bg-primary-wash',
  line: 'h-1.5 rounded-full bg-divider',
  placeholderLine: 'h-1.5 my-2 mx-0 rounded-full bg-divider',
  title: '[margin-block-end:8px] text-xl leading-7 font-semibold',
};

export default function PluginEmptyState() {
  const { t } = useTranslation('plugin');

  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <span className="anticon" role="img">
          <Puzzle fill={'transparent'} height={32} size={32} width={32} />
        </span>
      </div>
      <h4 className={styles.title}>{t('dev.preview.empty.title')}</h4>
      <p className={styles.description}>{t('dev.preview.empty.desc')}</p>
      <div className="flex flex-col items-center gap-2">
        <div className={`${styles.line} w-32`} />
        <div className={`${styles.line} w-24`} />
        <div className={`${styles.line} w-12`} />
      </div>
    </div>
  );
}
