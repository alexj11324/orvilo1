import { register } from '@orvilo/observability-otel/node';

import { version } from '../package.json';

register({ version });
