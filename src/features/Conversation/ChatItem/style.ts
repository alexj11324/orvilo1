import { clsx } from 'cn';

import nativeStyles from './ChatItem.module.css';

export const styles = {
  container: clsx('orvilo-motion-scope', nativeStyles.container),
  loading:
    'absolute inset-be-0 -start-1 [inset-inline-end:unset] size-4 rounded-full text-background bg-primary',
};
