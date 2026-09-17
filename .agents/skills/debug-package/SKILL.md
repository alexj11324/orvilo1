---
name: debug-package
description: 'Use for debug() logging, orvilo-* namespaces, DEBUG/localStorage.debug configuration and log formatting.'
user-invocable: false
---

# Debug Package Usage Guide

## Basic Usage

```typescript
import debug from 'debug';

// Format: orvilo-[module]:[submodule]
const log = debug('orvilo-server:market');

log('Simple message');
log('With variable: %O', object);
log('Formatted number: %d', number);
```

## Namespace Conventions

- Desktop: `orvilo-desktop:[module]`
- Server: `orvilo-server:[module]`
- Client: `orvilo-client:[module]`
- Router: `orvilo-[type]-router:[module]`

## Format Specifiers

- `%O` - Object expanded (recommended for complex objects)
- `%o` - Object
- `%s` - String
- `%d` - Number

## Enable Debug Output

### Browser

```javascript
localStorage.debug = 'orvilo-*';
```

### Node.js

```bash
DEBUG=orvilo-* npm run dev
DEBUG=orvilo-* pnpm dev
```

### Electron

```typescript
process.env.DEBUG = 'orvilo-*';
```

## Example

```typescript
// apps/server/src/routers/edge/market/index.ts
import debug from 'debug';

const log = debug('orvilo-edge-router:market');

log('getAgent input: %O', input);
```
