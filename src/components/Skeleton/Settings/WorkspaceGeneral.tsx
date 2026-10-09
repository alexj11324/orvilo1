import SkeletonBar from '../Bar';

const WorkspaceGeneralSkeleton = () => (
  <div aria-busy className="@container mx-auto flex w-full max-w-160 flex-col gap-6">
    <SkeletonBar height={24} width={104} />
    <div className="divide-y divide-border">
      {[0, 1, 2, 3].map((row) => (
        <div
          className="grid items-center gap-x-6 gap-y-3 py-4 @min-[560px]:grid-cols-[160px_minmax(0,1fr)]"
          key={row}
        >
          <SkeletonBar height={20} width={64} />
          <SkeletonBar height={row === 3 ? 20 : 36} width={row === 3 ? 100 : '100%'} />
        </div>
      ))}
    </div>
    <div className="flex justify-end">
      <SkeletonBar height={36} width={56} />
    </div>
  </div>
);

export default WorkspaceGeneralSkeleton;
