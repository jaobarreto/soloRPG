import { z } from 'zod';

export const dialogueActs = [
  'ANSWER',
  'DOUBT',
  'DISAGREE',
  'CLARIFY',
  'CAUTION',
  'RESUME',
  'REFUSE',
  'UNKNOWN',
] as const;
export const dialogueTopics = [
  'conversation',
  'disagreement',
  'promise',
  'surroundings',
] as const;
export const dialogueProvenanceSchema = z.strictObject({
  authorId: z.string().trim().min(1).max(100),
  source: z.string().trim().min(1).max(300),
  reviewed: z.literal(true),
});
// Local preparation only. These bindings are never accepted from a FREE proposal.
export const dialogueBindingSchema = z.strictObject({
  libraryId: z.literal('khaos-dialogue'),
  contentVersion: z.literal(1),
  characterId: z.uuid(),
  voiceId: z.enum(['RESERVED', 'WARM']),
  expectedState: z.string().max(500),
  topics: z.array(z.enum(dialogueTopics)).max(4),
  sources: z
    .array(
      z.strictObject({
        key: z.enum(['disagreement', 'promise', 'surroundings']),
        kind: z.enum(['KNOWLEDGE', 'PUBLIC']),
        referenceId: z.uuid(),
        descriptionHash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(3),
  provenance: dialogueProvenanceSchema,
});
export type DialogueBinding = z.infer<typeof dialogueBindingSchema>;
export interface DialogueSelection {
  topic: string;
  act: (typeof dialogueActs)[number];
}
export interface DialogueMenu {
  characterId: string;
  name: string;
  choices: DialogueSelection[];
}

const storyKey = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(100);
const definitionId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*:v[1-9][0-9]*$/)
  .max(120);
const contentHash = z.string().regex(/^[a-f0-9]{64}$/);
export const storyCardSpeakerSchema = z.strictObject({
  kind: z.literal('STORY_CARD'),
  entityId: z.uuid(),
  characterKey: storyKey,
  definitionId,
  definitionDigest: contentHash,
  entityNamespace: storyKey,
});
export type StoryCardSpeaker = z.infer<typeof storyCardSpeakerSchema>;
export const storyCardDialogueBindingSchema = dialogueBindingSchema
  .omit({ characterId: true, topics: true })
  .extend({
    characterKey: storyKey,
    entityId: z.uuid(),
    choices: z
      .array(
        z.strictObject({
          topic: z.enum(dialogueTopics),
          act: z.enum(dialogueActs),
        }),
      )
      .min(1)
      .max(32),
  });
// Administrative preparation only; never a FREE capability or an LLM input.
export const storyCardDialogueManifestSchema = z.strictObject({
  bindingVersion: z.literal(1),
  campaignId: z.uuid(),
  definitionId,
  definitionDigest: contentHash,
  entityNamespace: storyKey,
  sceneKey: storyKey,
  provenance: dialogueProvenanceSchema,
  bindings: z.array(storyCardDialogueBindingSchema).min(1).max(30),
});
export type StoryCardDialogueManifest = z.infer<
  typeof storyCardDialogueManifestSchema
>;
