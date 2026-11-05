import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { storyCardDialogueManifestSchema } from '@solo-rpg/shared-contracts';
import { adventureDefinitionSchema } from '../../src/adventures/core/definitions/definition';
import {
  adventureEntityId,
  digest,
} from '../../src/adventures/core/state/identity';
export const storyFixture = JSON.parse(
  readFileSync(resolve(__dirname, 'story-card-dialogue-plan.json'), 'utf8'),
);
export const storyDefinition = adventureDefinitionSchema.parse(
  storyFixture.definition,
);
const variant = structuredClone(storyDefinition);
variant.version = 2;
variant.scenes[0]!.characterKeys = ['keeper-a', 'keeper-b'];
variant.scenes[0]!.options.push({
  key: 'inspect',
  intent: 'Examinar a estante',
  mode: 'ACT',
  keywords: ['examinar', 'estante'],
  check: { ability: 'PERCEPTION', targetNumber: 99 },
  successText: 'O selo foi identificado.',
  failureText: 'A busca não identificou nenhuma abertura.',
});
export const storyBothDefinition = adventureDefinitionSchema.parse(variant);
export function storyManifest(
  campaignId: string,
  definition = storyDefinition,
  sourceId = storyFixture.events[0].id,
) {
  return storyCardDialogueManifestSchema.parse({
    bindingVersion: 1,
    campaignId,
    definitionId: `${definition.id}:v${definition.version}`,
    definitionDigest: digest(definition),
    entityNamespace: definition.id,
    sceneKey: 'study',
    provenance: storyFixture.draftBinding.provenance,
    bindings: [
      {
        characterKey: 'keeper-a',
        entityId: adventureEntityId(campaignId, 'keeper-a', definition.id),
        libraryId: 'khaos-dialogue',
        contentVersion: 1,
        voiceId: 'RESERVED',
        expectedState: 'UNRESOLVED',
        choices: [
          { topic: 'conversation', act: 'ANSWER' },
          { topic: 'conversation', act: 'UNKNOWN' },
          { topic: 'promise', act: 'ANSWER' },
          { topic: 'disagreement', act: 'ANSWER' },
        ],
        sources: [
          { ...storyFixture.draftBinding.sources[0], referenceId: sourceId },
        ],
        provenance: storyFixture.draftBinding.provenance,
      },
    ],
  });
}
