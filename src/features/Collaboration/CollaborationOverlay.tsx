'use client';

import { memo } from 'react';

import { CursorLayer } from './CursorLayer';

/** The board shows human cursors only; issue execution remains in its detail view. */
export const CollaborationOverlay = memo(() => <CursorLayer />);

CollaborationOverlay.displayName = 'CollaborationOverlay';
