import { scenePlanSchema, freeActionSchema } from '@solo-rpg/shared-contracts';
import {
  storyFixture,
  storyManifest,
  storyDefinition,
} from './fixtures/story-card-dialogue';
const manifest = storyManifest(storyFixture.campaign.campaignId);
describe('TEST-SCARD-001/013/014 versioned opt-in contract', () => {
  it('accepts an explicitly scoped story manifest in the existing plan JSONB', () => {
    expect(
      scenePlanSchema.safeParse({
        opening: 'Sala.',
        presentCharacterIds: [],
        options: [],
        storyCardDialogue: manifest,
      }).success,
    ).toBe(true);
  });
  it('keeps plans without opt-in unchanged and gives FREE no manifest authority', () => {
    const old = scenePlanSchema.parse({
      opening: 'Sala.',
      presentCharacterIds: [],
      options: [],
    });
    expect(old).not.toHaveProperty('storyCardDialogue');
    expect(
      freeActionSchema.safeParse({
        kind: 'FREE',
        intent: 'TALK',
        description: 'Conversar',
        target: { type: 'CHARACTER', name: 'Lior' },
        tool: { type: 'DIALOGUE', storyCardDialogue: manifest },
      }).success,
    ).toBe(false);
  });
});

import { storyManifestForScope } from '../src/adventures/core/scenes/story-dialogue';
import {
  digest,
  adventureEntityId,
} from '../src/adventures/core/state/identity';
import { storyHeardSources } from '../src/narrative/story-card-dialogue';
import {
  authorizeDialogue,
  dialogueSourceHash,
} from '../src/narrative/dialogue-content';
const scope = {
  campaignId: manifest.campaignId,
  definitionId: manifest.definitionId,
  definition: storyDefinition,
  registeredDefinition: storyDefinition,
  registeredNamespace: storyDefinition.id,
  storedDigest: digest(storyDefinition),
  entityNamespace: storyDefinition.id,
  sceneKey: 'study',
};
describe('TEST-SCARD-005/009/014/017/018 explicit scope and conservative sources', () => {
  it('checks the exact registered and stored instance and preserves historical derived IDs', () => {
    expect(storyManifestForScope(manifest, scope)).toEqual(manifest);
    expect(manifest.bindings[0]!.entityId).toBe(
      adventureEntityId(scope.campaignId, 'keeper-a', scope.entityNamespace),
    );
    for (const change of [
      { campaignId: storyFixture.cast[0].entityId },
      { definitionId: 'other:v1' },
      { definitionDigest: '0'.repeat(64) },
      { entityNamespace: 'other' },
      { sceneKey: 'courtyard' },
      { bindingVersion: 2 },
    ])
      expect(
        storyManifestForScope({ ...manifest, ...change }, scope),
      ).toBeNull();
    for (const change of [
      { storedDigest: '0'.repeat(64) },
      { registeredDefinition: { ...storyDefinition, version: 99 } },
      { registeredNamespace: 'other' },
    ])
      expect(
        storyManifestForScope(manifest, { ...scope, ...change }),
      ).toBeNull();
  });
  it('rejects duplicate identities, foreign UUIDs, archetypes and unknown keys', () => {
    expect(
      storyManifestForScope(
        { ...manifest, bindings: [...manifest.bindings, ...manifest.bindings] },
        scope,
      ),
    ).toBeNull();
    for (const key of ['guards', 'missing'])
      expect(
        storyManifestForScope(
          {
            ...manifest,
            bindings: [
              {
                ...manifest.bindings[0],
                characterKey: key,
                entityId: adventureEntityId(
                  scope.campaignId,
                  key,
                  scope.entityNamespace,
                ),
              },
            ],
          },
          scope,
        ),
      ).toBeNull();
    expect(
      storyManifestForScope(
        {
          ...manifest,
          bindings: [
            {
              ...manifest.bindings[0],
              entityId: storyFixture.cast[1].entityId,
            },
          ],
        },
        scope,
      ),
    ).toBeNull();
  });
  it('never promotes a cast association to WITNESSED or personal participation', () => {
    const id = manifest.bindings[0]!.entityId;
    const rows = storyHeardSources(
      id,
      storyFixture.events.map(
        (e: {
          id: string;
          description: string;
          type: string;
          visibility: string;
        }) => ({
          eventId: e.id,
          description: e.description,
          eventType: e.type,
          visibility: e.visibility,
        }),
      ),
    );
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.source === 'HEARD' && r.participants === undefined),
    ).toBe(true);
    const b = manifest.bindings[0]!;
    const source = rows.find((r) => r.eventType === 'CONSEQUENCE_RECORDED')!;
    const replies = authorizeDialogue(
      {
        libraryId: b.libraryId,
        contentVersion: 1,
        voiceId: b.voiceId,
        expectedState: b.expectedState,
        provenance: b.provenance,
        characterId: id,
        topics: ['disagreement'],
        sources: [
          {
            key: 'disagreement',
            kind: 'KNOWLEDGE',
            referenceId: source.referenceId,
            descriptionHash: dialogueSourceHash(source.description),
          },
        ],
      },
      { id, name: 'Lior', state: 'UNRESOLVED', available: true },
      rows,
    );
    expect(replies).toEqual([]);
  });
});

it('TEST-SCARD-005 preserves import digest across JSONB object-key ordering', () => {
  const jsonbLike = JSON.parse(
    JSON.stringify(storyDefinition, (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ),
  );
  expect(digest(jsonbLike)).not.toBe(scope.storedDigest);
  expect(
    storyManifestForScope(manifest, { ...scope, definition: jsonbLike }),
  ).toEqual(manifest);
});
it('TEST-SCARD-018 rejects an archetype even when its key is explicitly present in the scene', () => {
  const def = structuredClone(storyDefinition);
  def.version = 3;
  def.scenes[0]!.characterKeys.push('guards');
  const hash = digest(def);
  const m = {
    ...manifest,
    definitionDigest: hash,
    definitionId: `${def.id}:v3`,
    bindings: [
      {
        ...manifest.bindings[0],
        characterKey: 'guards',
        entityId: adventureEntityId(
          scope.campaignId,
          'guards',
          scope.entityNamespace,
        ),
      },
    ],
  };
  expect(
    storyManifestForScope(m, {
      ...scope,
      definitionId: `${def.id}:v3`,
      definition: def,
      registeredDefinition: def,
      storedDigest: hash,
    }),
  ).toBeNull();
});
