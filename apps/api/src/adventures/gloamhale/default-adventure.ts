// Compatibility alias for the pre-registry local IMPORT envelope.
export const defaultAdventure = {
  id: 'six-of-swords-gloamhale',
  version: 1,
} as const;

export const legacyEntityNamespace = 'gloamhale';

// Default for new public campaigns; legacy IMPORT without selectors remains v1.
export const currentAdventure = {
  id: defaultAdventure.id,
  version: 5,
} as const;
