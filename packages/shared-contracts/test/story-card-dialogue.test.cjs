const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  scenePlanSchema,
  freeActionSchema,
  storyCardDialogueManifestSchema,
  narrationSchema,
} = require('../dist');
const f = require('../../../apps/api/test/fixtures/story-card-dialogue-plan.json');
test('TEST-SCARD-001/013/014 strict server-only manifest and unchanged FREE/NARRATE wire', () => {
  const raw = {
    bindingVersion: 1,
    campaignId: f.campaign.campaignId,
    definitionId: f.campaign.definitionId,
    definitionDigest: f.campaign.definitionDigest,
    entityNamespace: f.campaign.entityNamespace,
    sceneKey: 'study',
    provenance: f.draftBinding.provenance,
    bindings: [
      {
        characterKey: 'keeper-a',
        entityId: f.cast[0].entityId,
        libraryId: 'khaos-dialogue',
        contentVersion: 1,
        voiceId: 'RESERVED',
        expectedState: 'UNRESOLVED',
        choices: [{ topic: 'conversation', act: 'ANSWER' }],
        sources: f.draftBinding.sources,
        provenance: f.draftBinding.provenance,
      },
    ],
  };
  assert.ok(
    scenePlanSchema.safeParse({
      opening: 'Sala.',
      presentCharacterIds: [],
      options: [],
      storyCardDialogue: raw,
    }).success,
  );
  for (const invalid of [
    { ...raw, bindingVersion: 2 },
    { ...raw, bindings: [{ ...raw.bindings[0], contentVersion: 2 }] },
    { ...raw, bindings: [{ ...raw.bindings[0], text: 'Inventada' }] },
  ])
    assert.equal(
      storyCardDialogueManifestSchema.safeParse(invalid).success,
      false,
    );
  assert.equal(
    freeActionSchema.safeParse({
      kind: 'FREE',
      intent: 'TALK',
      description: 'Conversar',
      tool: { type: 'DIALOGUE', storyCardDialogue: raw },
    }).success,
    false,
  );
  assert.equal(
    narrationSchema.safeParse({
      narrative: 'Texto.',
      eventIds: [],
      storyCardDialogue: raw,
    }).success,
    false,
  );
});
