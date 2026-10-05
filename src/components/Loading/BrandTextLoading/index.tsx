import CircleLoading from '../CircleLoading';
import styles from './index.module.css';

interface BrandTextLoadingProps {
  debugId: string;
}

const BrandTextLoading = (_props: BrandTextLoadingProps) => (
  <div className={styles.container}>
    <CircleLoading />
  </div>
);

export default BrandTextLoading;
