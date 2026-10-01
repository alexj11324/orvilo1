import { ORVILO_DEFAULT_MODEL_LIST } from 'model-bank';

import { modelDescriptionOverrides } from '../modelDescriptionOverrides';
import { orviloHubOnlineModelDescriptions } from '../orviloOnlineModelDescriptions';

const locales: Record<`${string}.description`, string> = {};

ORVILO_DEFAULT_MODEL_LIST.forEach((model) => {
  if (!model.description) return;

  locales[`${model.id}.description`] = model.description;
});

Object.assign(locales, modelDescriptionOverrides);
Object.assign(locales, orviloHubOnlineModelDescriptions);

export default locales;
