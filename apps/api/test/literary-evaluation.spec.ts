import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueActs,
  dialogueTopics,
  freeActionSchema,
  type DialogueSelection,
  type NarrativeBeat,
} from '@solo-rpg/shared-contracts';
import {
  adventureEntityId,
  digest,
} from '../src/adventures/core/state/identity';
import { storyManifestForScope } from '../src/adventures/core/scenes/story-dialogue';
import { interpretFreeAction } from '../src/narrative/free-action';
import { selectionContext } from '../src/narrative/information';
import {
  authorizeDialogue,
  dialogueSourceHash,
  type DialogueSource,
} from '../src/narrative/dialogue-content';
import { storyHeardSources } from '../src/narrative/story-card-dialogue';
import {
  modelRendering,
  publicationChoices,
  validateRendering,
  type RenderingContext,
} from '../src/narrative/rendering';
import {
  storyBothDefinition,
  storyManifest,
} from './fixtures/story-card-dialogue';

interface Actor {
  kind: 'REGULAR' | 'STORY_CARD';
  characterKey?: string;
  name: string;
  voiceId: 'RESERVED' | 'WARM';
  personality: string;
  motivations: string;
  speech: string;
  state: string;
}
interface Step {
  id: string;
  playerMessage: string;
  speakerKey?: string;
  category: string;
  topic?: string;
  act?: DialogueSelection['act'];
  sourceKeys?: string[];
  session: number;
  confirmedText?: string;
  informationState?: string;
  expression?: 'QUESTION' | 'DIRECT';
}
interface Source {
  owner: string;
  source: string;
  eventType: string;
  description: string;
  topic: 'disagreement' | 'promise';
  participated: boolean;
}
interface Fixture {
  scene: string;
  actors: Record<string, Actor>;
  sources: Record<string, Source>;
  scenarios: { id: string; name: string; turns: Step[] }[];
}
const fixture: Fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/phase563c0-literary.json'), 'utf8'),
);
const campaignId = '10000000-0000-4000-8000-000000000001';
const id = (key: string) => adventureEntityId(campaignId, key, 'literary-eval');
const actorId = (key: string) => {
  const actor = fixture.actors[key]!;
  return actor.kind === 'STORY_CARD'
    ? adventureEntityId(campaignId, actor.characterKey!, storyBothDefinition.id)
    : id(key);
};
const provenance = {
  authorId: 'synthetic-literary-preparation',
  source: 'fixture:phase563c0',
  reviewed: true as const,
};

function prepare(step: Step) {
  const actor = step.speakerKey ? fixture.actors[step.speakerKey]! : null;
  const speakerId = actor ? actorId(step.speakerKey!) : null;
  const rows: DialogueSource[] = (step.sourceKeys ?? [])
    .map((key) => ({ key, value: fixture.sources[key]! }))
    // This is fixture preparation, not a substitute for the production DB loader.
    .filter(({ value }) => value.owner === step.speakerKey)
    .map(({ key, value }) => ({
      kind: 'KNOWLEDGE',
      referenceId: id(key),
      characterId: speakerId!,
      description: value.description,
      visibility: 'PUBLIC',
      source: value.source,
      eventType: value.eventType,
      participants: value.participated ? [speakerId!] : [],
    }));
  const sources =
    actor?.kind === 'STORY_CARD'
      ? storyHeardSources(
          speakerId!,
          rows.map((r) => ({
            eventId: r.referenceId,
            description: r.description,
            eventType: r.eventType!,
            visibility: r.visibility,
          })),
        )
      : rows;
  const links = (step.sourceKeys ?? [])
    .filter((key) => fixture.sources[key]!.owner === step.speakerKey)
    .map((key) => ({
      key: fixture.sources[key]!.topic,
      kind: 'KNOWLEDGE' as const,
      referenceId: id(key),
      descriptionHash: dialogueSourceHash(fixture.sources[key]!.description),
    }));
  let manifest;
  if (actor?.kind === 'STORY_CARD') {
    const raw = storyManifest(campaignId, storyBothDefinition);
    raw.bindings = [
      {
        ...raw.bindings[0]!,
        characterKey: actor.characterKey!,
        entityId: speakerId!,
        voiceId: actor.voiceId,
        choices: dialogueTopics.flatMap((topic) =>
          dialogueActs.map((act) => ({ topic, act })),
        ),
        sources: links,
      },
    ];
    manifest = storyManifestForScope(raw, {
      campaignId,
      definitionId: `${storyBothDefinition.id}:v${storyBothDefinition.version}`,
      definition: storyBothDefinition,
      registeredDefinition: storyBothDefinition,
      registeredNamespace: storyBothDefinition.id,
      entityNamespace: storyBothDefinition.id,
      storedDigest: digest(storyBothDefinition),
      sceneKey: 'study',
    });
    expect(manifest).not.toBeNull();
  }
  const allReplies = actor
    ? authorizeDialogue(
        {
          libraryId: 'khaos-dialogue',
          contentVersion: 1,
          characterId: speakerId,
          voiceId: actor.voiceId,
          expectedState: actor.state,
          topics: [...dialogueTopics],
          sources: links,
          provenance,
        },
        {
          id: speakerId!,
          name: actor.name,
          state: actor.state,
          available: true,
        },
        sources,
      )
    : [];
  const replies = allReplies.filter(
    (r) => r.topic === step.topic && r.act === step.act,
  );
  const pc = {
    id: id('pc'),
    name: 'Protagonista',
    kind: 'PROTAGONIST',
    available: true,
    knowledge: [],
    inventory: [],
  };
  const current = actor
    ? {
        id: speakerId!,
        name: actor.name,
        kind: actor.kind === 'STORY_CARD' ? 'STORY_NPC' : 'COMPANION',
        available: true,
      }
    : null;
  const choices = allReplies
    .map((r) => ({ topic: r.topic, act: r.act }))
    .filter(
      (r, i, all) =>
        all.findIndex((a) => a.topic === r.topic && a.act === r.act) === i,
    );
  const snapshot = {
    freeActions: true,
    characters: [pc],
    actors: current ? [pc, current] : [pc],
    world: [],
    options: [],
    combat: null,
    dialogue: current
      ? [{ characterId: current.id, name: current.name, choices }]
      : [],
    selection: selectionContext(
      { characters: [pc], world: [], rules: [], scene: fixture.scene },
      [],
    ),
  };
  const proposal = actor
    ? freeActionSchema.parse({
        kind: 'FREE',
        intent: 'TALK',
        expression: step.expression ?? 'QUESTION',
        description: 'Conversar com o interlocutor selecionado.',
        target: { type: 'CHARACTER', name: actor.name },
        evidence: [],
        tool: { type: 'DIALOGUE', topic: step.topic, act: step.act },
      })
    : null;
  const resolution = proposal
    ? interpretFreeAction(proposal, 'SPEAK', snapshot)
    : null;
  const confirmed = {
    narrative: resolution?.text ?? step.confirmedText!,
    eventIds: [],
  };
  const context: RenderingContext = {
    category: resolution?.category ?? step.category,
    protagonist: { id: pc.id, name: pc.name },
    speaker: actor
      ? {
          id: speakerId!,
          name: actor.name,
          personality: actor.personality,
          motivations: actor.motivations,
          state: actor.state,
          speech: actor.kind === 'STORY_CARD' ? actor.speech : '',
        }
      : null,
    scene: fixture.scene,
    facts: sources.map((r) => ({
      eventId: r.referenceId,
      description: r.description,
      source: r.source,
    })),
    rules: [],
    ...(actor
      ? {
          dialogue: {
            version: 1 as const,
            selection: { topic: step.topic!, act: step.act! },
            replies,
          },
        }
      : {}),
    ...(actor?.kind === 'STORY_CARD'
      ? { speakerOrigin: 'STORY_CARD' as const }
      : {}),
  };
  context.publication = {
    version: 1,
    choices: publicationChoices(context, confirmed),
  };
  return {
    actor,
    speakerId,
    sources,
    replies,
    allReplies,
    snapshot,
    proposal,
    resolution,
    context,
    confirmed,
    manifest,
  };
}

const runs: object[] = [];
const controls: object[] = [];
describe('TEST-LITC0 catalog diagnostics, never a real provider evaluation', () => {
  afterAll(() => {
    const selected = [
      ['NAR-03', 0],
      ['NAR-03', 1],
      ['NAR-03', 2],
      ['NAR-07', 0],
      ['NAR-07', 1],
      ['NAR-08', 1],
    ] as const;
    const liveCases = selected.map(([key, index], i) => {
      const step = fixture.scenarios.find((s) => s.id === key)!.turns[index]!;
      const p = prepare(step);
      const base = {
        actionId: id(`live-${i}`),
        campaignId,
        sessionId: id('session-1'),
        interactionMode: 'SPEAK',
        playerMessage: step.playerMessage,
      };
      return {
        caseId: `C1-${i + 1}`,
        sourceTurnId: step.id,
        sequence:
          i < 3
            ? 'A_REGULAR_CONFLICT'
            : i < 5
              ? 'B_STORY_PROMISE'
              : 'C_WARM_MATCHED_A1',
        proposeRequest: {
          ...base,
          stage: 'PROPOSE',
          context: p.snapshot,
          confirmed: null,
        },
        narrateRequest: {
          ...base,
          stage: 'NARRATE',
          context: { rendering: modelRendering(p.context) },
          confirmed: p.confirmed,
        },
        expectedProposal: p.proposal,
        acceptableSemanticSelections: [{ topic: step.topic, act: step.act }],
        authorizedPreparedBeats: p.replies.map((r) => r.beat),
        scope:
          'FROZEN_SYNTHETIC_PROJECTION_NO_PERSISTENCE_NO_DYNAMIC_ASSISTANT_HISTORY',
      };
    });
    writeFileSync(
      '/tmp/khaos563c0-catalogs.json',
      JSON.stringify(
        {
          phase: '5.6.3C.0',
          evidenceKind: 'PURE_PRODUCTION_CATALOG_POLICY_SCRIPTED_SELECTION',
          realProviderRequests: 0,
          databaseUsed: false,
          complete: true,
          limitations: [
            'Story eligibility is prepared in memory; real DB loader/lifecycle remain covered by separate B.1 integration regressions.',
            'No memory writeback is simulated; recursive quote evidence comes from historical A.',
            'Prepared mechanical outcomes are synthetic inputs, not engine executions.',
          ],
          runs,
          controls,
          liveCases,
        },
        null,
        2,
      ) + '\n',
    );
  });

  for (const scenario of fixture.scenarios)
    for (const selector of ['FIRST_PREPARED', 'ROTATE_PREPARED'] as const) {
      it(`TEST-LITC0-001 ${scenario.id} ${selector} records actual eligible catalogs and authorized output`, () => {
        const turns = scenario.turns.map((step, i) => {
          const p = prepare(step);
          const choices = p.context.publication!.choices;
          let selected: NarrativeBeat[] = [];
          if (p.context.category === 'DIALOGUE') {
            expect(p.replies.length).toBeGreaterThan(0);
            const reply =
              p.replies[
                selector === 'FIRST_PREPARED' ? 0 : i % p.replies.length
              ]!.beat;
            selected = [
              reply,
              ...choices.filter((b) => b.kind === 'ATMOSPHERE').slice(0, 1),
            ];
            const questions = choices.filter((b) => b.kind === 'QUESTION');
            selected.push(
              questions[
                selector === 'FIRST_PREPARED' ? 0 : i % questions.length
              ]!,
            );
          } else if (p.context.category === 'MECHANIC')
            selected = [choices.find((b) => b.kind === 'RESULT')!];
          const draft = selected.length
            ? {
                narrative: selected.map((b) => b.text).join('\n\n'),
                eventIds: [],
                beats: selected,
              }
            : p.confirmed;
          const validation = validateRendering(draft, p.confirmed, p.context);
          expect(validation.accepted).toBe(true);
          expect(validation.narration.narrative).not.toContain('galeria');
          expect(JSON.stringify(modelRendering(p.context))).not.toContain(
            'PRIVATE_',
          );
          return {
            ...step,
            actorKind: p.actor?.kind ?? null,
            voiceId: p.actor?.voiceId ?? null,
            resolvedCategory: p.context.category,
            resolutionReason: p.resolution?.reason ?? null,
            preparedReplyCount: p.replies.length,
            catalog: choices,
            preparedReplies: p.replies.map((r) => ({ id: r.id, beat: r.beat })),
            authorizedFacts: p.context.facts,
            publicText: validation.narration.narrative,
            publishedBeats: validation.narration.beats ?? [],
            validationAccepted: validation.accepted,
            validationReason: validation.reason,
            contentGap:
              p.resolution?.reason === 'UNAUTHORIZED_DIALOGUE_SELECTION',
            canonicalFindings: [],
            humanScores: null,
          };
        });
        runs.push({ scenarioId: scenario.id, selector, turns });
      });
    }
  it('TEST-LITC0-002 changing speech and motivation does not add material to a voice profile', () => {
    const step = fixture.scenarios[0]!.turns[0]!;
    const a = prepare(step);
    const b = {
      ...a.context,
      speaker: {
        ...a.context.speaker!,
        personality: 'Reservada, irônica e expansiva em argumentos',
        motivations: 'Deseja guardar os documentos, não discutir a viagem.',
        speech: 'Usa humor seco e períodos longos.',
      },
    };
    expect(publicationChoices(b, a.confirmed)).toEqual(
      a.context.publication!.choices,
    );
    controls.push({
      id: 'VOICE_PROFILE_COLLAPSE',
      sameCatalog: true,
      changedFields: [
        'personality within reserved category',
        'motivations',
        'speech',
      ],
    });
  });
  it('TEST-LITC0-003 generic selection can replace eligible contextual content without becoming a rejection', () => {
    const p = prepare(fixture.scenarios[2]!.turns[0]!);
    const beat = p.context.publication!.choices.find(
      (b) => b.kind === 'DIALOGUE',
    )!;
    const result = validateRendering(
      { narrative: beat.text, eventIds: [], beats: [beat] },
      p.confirmed,
      p.context,
    );
    expect(result.accepted).toBe(true);
    expect(p.replies).toHaveLength(2);
    expect(p.replies.some((r) => r.beat.text === beat.text)).toBe(false);
    controls.push({
      id: 'GENERIC_OVER_CONTEXTUAL',
      eligiblePrepared: 2,
      accepted: result.accepted,
      published: result.narration.narrative,
      origin: 'DELIBERATELY_SCRIPTED_SELECTION_NOT_GEMINI',
    });
  });
  it('TEST-LITC0-004 insufficient cast provenance refuses the requested pair; it is not a publication fallback', () => {
    const p = prepare(fixture.scenarios[10]!.turns[3]!);
    expect(p.replies).toHaveLength(0);
    expect(p.resolution).toMatchObject({
      category: 'CLARIFY',
      reason: 'UNAUTHORIZED_DIALOGUE_SELECTION',
    });
    expect(p.context.facts.every((f) => f.source === 'HEARD')).toBe(true);
  });
  it('TEST-LITC0-005 the unchanged boundary refuses the gallery and preserves only the official failed result', () => {
    const p = prepare(fixture.scenarios[9]!.turns[2]!);
    const result = p.context.publication!.choices.find(
      (b) => b.kind === 'RESULT',
    )!;
    const bad: NarrativeBeat = {
      kind: 'ATMOSPHERE',
      speakerId: null,
      factIds: [],
      text: 'Atrás da estante há uma galeria que conduz ao jardim.',
    };
    const validation = validateRendering(
      {
        narrative: `${result.text}\n\n${bad.text}`,
        eventIds: [],
        beats: [result, bad],
      },
      p.confirmed,
      p.context,
    );
    expect(validation).toMatchObject({
      accepted: false,
      reason: 'UNAPPROVED_SEGMENT',
      narration: { narrative: 'A busca não identificou nenhuma abertura.' },
    });
    controls.push({ id: 'GALLERY_REJECTION', validation });
  });
});
