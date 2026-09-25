const READ_ONLY = 'read-only';

// Serialized into renderers by the runner. Only exact identity segments are replaceable.
export function normalizeLocationRoute(pathname, searchValue, hash, mappings) {
  const atPosition = (kind, index, value, locator) =>
    mappings.find((mapping) => {
      if (mapping.kind !== kind || mapping.index !== index || mapping.from !== value) return false;
      if (kind === 'query') return mapping.key === locator.key;
      return (
        mapping.context.length === locator.context.length &&
        mapping.context.every((segment, contextIndex) => segment === locator.context[contextIndex])
      );
    })?.to || value;
  const pathSegments = pathname.split('/');
  const path = pathSegments
    .map((segment, index) =>
      atPosition('path', index, segment, { context: pathSegments.slice(0, index) }),
    )
    .join('/');
  const originalQueryEntries = [...new URLSearchParams(searchValue).entries()];
  const queryEntries = originalQueryEntries.map(([key, value], index) => [
    key,
    atPosition('query', index, value, { key }),
  ]);
  const query = new URLSearchParams(queryEntries).toString();
  const hashSegments = hash.replace(/^#/, '').split('/');
  const normalizedHash = hash
    ? `#${hashSegments
        .map((segment, index) =>
          atPosition('hash', index, segment, { context: hashSegments.slice(0, index) }),
        )
        .join('/')}`
    : '';
  return `${path}${query ? `?${query}` : ''}${normalizedHash}`;
}

export function parseActions(config) {
  if (config.action && config.actions)
    throw new Error('Configure either action or actions, not both.');
  const configured = config.actions || (config.action ? [config.action] : null);
  if (!Array.isArray(configured) || configured.length === 0)
    throw new Error('Configure at least one read-only action.');

  return configured.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Action ${index + 1} must be an object.`);
    if (entry.safety !== READ_ONLY)
      throw new Error(`Action ${index + 1} is not explicitly classified read-only.`);
    const type = entry.type || 'click';
    if (!['click', 'reload'].includes(type))
      throw new Error(`Action ${index + 1} has unsupported type ${JSON.stringify(type)}.`);
    if (type === 'click') {
      if (
        !Array.isArray(entry.names) ||
        entry.names.length === 0 ||
        entry.names.some((name) => typeof name !== 'string' || !name.trim())
      )
        throw new Error(`Click action ${index + 1} requires non-empty semantic names.`);
    } else if ('names' in entry) {
      throw new Error(`Reload action ${index + 1} must not configure a click target.`);
    }
    return { ...entry, type };
  });
}

export function validateSurfaceMappings(surface, label) {
  if (!surface || typeof surface.start !== 'string')
    throw new Error(`${label} requires a start URL.`);
  if (!URL.canParse(surface.start)) throw new Error(`${label} requires a valid start URL.`);
  for (const [index, mapping] of (surface.mappings || []).entries()) {
    if (
      !Array.isArray(mapping) ||
      mapping.length !== 2 ||
      mapping.some((value) => typeof value !== 'string' || !value)
    )
      throw new Error(`${label} mapping ${index + 1} must contain two non-empty strings.`);
  }
}

export function routeMappingsForSurface(surface) {
  const start = new URL(surface.start);
  const identities = new Map((surface.mappings || []).map(([from, to]) => [from, to]));
  const normalizedIdentities = new Map();
  for (const [from, to] of identities) {
    const identity = from.replace(/^\//, '').replace(/\/$/, '');
    const placeholder = to.replace(/^\//, '').replace(/\/$/, '');
    if (!identity.includes('/') && !placeholder.includes('/') && placeholder.startsWith(':'))
      normalizedIdentities.set(identity, placeholder);
  }
  const rules = [];
  const collectSegments = (kind, values) => {
    values.forEach((value, index) => {
      const to = normalizedIdentities.get(value);
      if (to) rules.push({ context: values.slice(0, index), from: value, index, kind, to });
    });
  };
  collectSegments('path', start.pathname.split('/'));
  [...start.searchParams.entries()].forEach(([key, value], index) => {
    const to = normalizedIdentities.get(value);
    if (to) rules.push({ from: value, index, key, kind: 'query', to });
  });
  collectSegments('hash', start.hash.replace(/^#/, '').split('/'));
  return rules;
}
