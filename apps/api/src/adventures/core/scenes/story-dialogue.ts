import { storyCardDialogueManifestSchema } from '@solo-rpg/shared-contracts';
import {
  adventureDefinitionSchema,
  type AdventureDefinition,
} from '../definitions/definition';
import { adventureEntityId, digest } from '../state/identity';

export interface StoryDialogueScope {
  campaignId: string;
  definitionId: string;
  definition: AdventureDefinition;
  registeredDefinition: AdventureDefinition;
  registeredNamespace: string;
  storedDigest: string;
  entityNamespace: string;
  sceneKey: string;
}

// An old plan is not a global manifest. Only this exact instance/scene may reuse it.
export function storyManifestForScope(raw: unknown, scope: StoryDialogueScope) {
  const parsed = storyCardDialogueManifestSchema.safeParse(raw);
  if (!parsed.success) return null;
  // PostgreSQL JSONB changes object-key order. Reapply the same strict schema
  // used at import before hashing; never change the stored/historical digest.
  const stored = adventureDefinitionSchema.safeParse(scope.definition);
  const registered = adventureDefinitionSchema.safeParse(
    scope.registeredDefinition,
  );
  if (!stored.success || !registered.success) return null;
  const m = parsed.data;
  if (
    m.campaignId !== scope.campaignId ||
    m.definitionId !== scope.definitionId ||
    scope.definitionId !==
      `${scope.definition.id}:v${scope.definition.version}` ||
    m.definitionDigest !== scope.storedDigest ||
    digest(stored.data) !== scope.storedDigest ||
    digest(registered.data) !== scope.storedDigest ||
    m.entityNamespace !== scope.entityNamespace ||
    scope.registeredNamespace !== scope.entityNamespace ||
    m.sceneKey !== scope.sceneKey
  )
    return null;
  const scene = scope.definition.scenes.find((s) => s.key === scope.sceneKey);
  if (
    !scene ||
    new Set(m.bindings.map((b) => b.characterKey)).size !== m.bindings.length ||
    new Set(m.bindings.map((b) => b.entityId)).size !== m.bindings.length
  )
    return null;
  for (const b of m.bindings) {
    if (
      !scene.characterKeys.includes(b.characterKey) ||
      !scope.definition.characters.some(
        (c) => c.key === b.characterKey && c.identityKind === 'INDIVIDUAL',
      ) ||
      b.entityId !==
        adventureEntityId(
          scope.campaignId,
          b.characterKey,
          scope.entityNamespace,
        ) ||
      new Set(b.sources.map((s) => s.key)).size !== b.sources.length
    )
      return null;
  }
  return m;
}
