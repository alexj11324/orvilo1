'use client';

import { useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import ShareErrorView from '@/features/Share/ErrorView';
import { shareKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';

import { ArtifactShareChrome } from './ArtifactShareChrome';

const SharedArtifactView = () => {
  const { id } = useParams<{ id: string }>();

  const { data, error, isLoading } = useSWR(
    id ? shareKeys.artifact(id) : null,
    () => lambdaClient.artifactShare.getShared.query({ id: id! }),
    { revalidateOnFocus: false },
  );

  if (!error && !data && isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loading debugId="SharedArtifactView" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-dvh w-full flex-col bg-background">
        <ArtifactShareChrome />
        <div className="flex-1 overflow-hidden">
          <ShareErrorView error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <ArtifactShareChrome title={data.title} />
      <div className="flex-1 overflow-hidden">
        <iframe
          className="h-full w-full border-0 bg-background"
          referrerPolicy={'no-referrer'}
          sandbox={'allow-scripts'}
          src={data.iframeSrc}
          title={data.title ?? 'Artifact'}
        />
      </div>
    </div>
  );
};

export default SharedArtifactView;
