import { DEFAULT_MODEL_PROVIDER_LIST } from 'model-bank/modelProviders';
import OrviloProvider from 'model-bank/modelProviders/orvilo';

const locales: Record<`${string}.description`, string> = {};

const providers = [OrviloProvider, ...DEFAULT_MODEL_PROVIDER_LIST];

providers.forEach((provider) => {
  if (!provider.description) return;
  locales[`${provider.id}.description`] = provider.description;
});

export default locales;
