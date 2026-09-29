'use client';

import TeamResources from './TeamResources';

const TeamHomeDocuments = ({ teamId }: { teamId: string }) => (
  <TeamResources documentsOnly teamId={teamId} />
);

export default TeamHomeDocuments;
