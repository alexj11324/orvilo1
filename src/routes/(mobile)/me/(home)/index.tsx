'use client';

import BrandWatermark from '@/components/BrandWatermark';

import Category from './features/Category';
import UserBanner from './features/UserBanner';

const MeHomePage = () => {
  return (
    <>
      <UserBanner />
      <Category />
      <div className="flex flex-col items-center justify-center p-4">
        <BrandWatermark />
      </div>
    </>
  );
};

export default MeHomePage;
