import { ActivityTypeEnum, LayersEnum, TypesEnum } from '@orvilo/types';

import { type UserMemoryModel } from '@/database/models/userMemory';

/** Explicit user-authored text uses existing owner-bound SQL writes, without inference or embeddings. */
export const createManualMemory = async (
  model: UserMemoryModel,
  layer: LayersEnum,
  content: string,
) => {
  const base = {
    details: content,
    summary: content,
    title: content.slice(0, 120),
    memoryLayer: layer,
    memoryType: TypesEnum.Other,
  };
  switch (layer) {
    case LayersEnum.Identity: {
      const row = await model.addIdentityEntry({ base, identity: { description: content } });
      return { id: row.identityId };
    }
    case LayersEnum.Context: {
      const row = await model.createContextMemory({
        ...base,
        context: {
          description: content,
          title: base.title,
          type: null,
          currentStatus: null,
          associatedObjects: [],
          associatedSubjects: [],
          descriptionVector: null,
          metadata: null,
          scoreImpact: null,
          scoreUrgency: null,
          tags: [],
        },
      });
      return { id: row.context.id };
    }
    case LayersEnum.Experience: {
      const row = await model.createExperienceMemory({
        ...base,
        experience: {
          action: null,
          actionVector: null,
          keyLearning: content,
          keyLearningVector: null,
          situation: null,
          situationVector: null,
          reasoning: null,
          possibleOutcome: null,
          metadata: null,
          scoreConfidence: null,
          tags: [],
          type: null,
        },
      });
      return { id: row.experience.id };
    }
    case LayersEnum.Activity: {
      const row = await model.createActivityMemory({
        ...base,
        activity: {
          narrative: content,
          narrativeVector: null,
          associatedLocations: [],
          associatedObjects: [],
          associatedSubjects: [],
          startsAt: null,
          endsAt: null,
          timezone: null,
          feedback: null,
          feedbackVector: null,
          notes: null,
          status: 'pending',
          type: ActivityTypeEnum.Other,
          metadata: null,
          tags: [],
        },
      });
      return { id: row.activity.id };
    }
    case LayersEnum.Preference: {
      const row = await model.createPreferenceMemory({
        ...base,
        preference: {
          conclusionDirectives: content,
          conclusionDirectivesVector: null,
          metadata: null,
          scorePriority: null,
          suggestions: null,
          tags: [],
          type: null,
        },
      });
      return { id: row.preference.id };
    }
  }
};
