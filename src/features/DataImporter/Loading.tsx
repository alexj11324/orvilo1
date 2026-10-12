'use client';

import nativeStyles from './Loading.module.css';

const DataLoading = () => {
  return (
    <div className="flex flex-col items-center justify-center h-20">
      <div
        className={`${nativeStyles.loader} animate-data-import-loading-grid motion-reduce:animate-none`}
        data-slot="data-import-loader"
      />
    </div>
  );
};

export default DataLoading;
