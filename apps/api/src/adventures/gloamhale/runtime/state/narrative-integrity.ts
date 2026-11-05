import type { Scene, ScenePolicy } from '../../../core/registry/scene-policy';
import { adventureEntityId } from '../../../core/state/identity';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { gameEvents } from '../../../../database/game-schema';
import type { AdventureDefinition } from '../../../core/definitions/definition';
import type { Reader } from '../../../core/state/state';

export const hasNarrativeIntegrity = (definition: AdventureDefinition) =>
  definition.id === 'six-of-swords-gloamhale' && definition.version >= 4;

export const revelations = {
  'study-sanatorium': {
    scene: 'study',
    text: 'Entre papéis quase ilegíveis, alguns documentos trazem o selo do Sanatório Gloamhale.',
    pages: [20],
  },
  'feast-dispelled': {
    scene: 'feast',
    text: 'O banquete desapareceu. A mesa e o salão estão tomados por mofo e teias.',
    pages: [20, 21],
    location: 'dining-room',
    description: 'O salão está deteriorado. Mofo e teias cobrem a mesa.',
  },
  'mirror-examined': {
    scene: 'erila',
    text: 'O espelho reflete o quarto deteriorado e deixa legível uma linha do poema.',
    pages: [21, 23],
  },
  'erila-identified': {
    scene: 'erila',
    text: 'A presença que conseguiu se comunicar se identifica como Erila Qinrel.',
    pages: [21, 22],
    identifies: 'erila',
  },
  'eric-identified': {
    scene: 'attic',
    text: 'O menino com a pulseira de sinos é Eric.',
    pages: [24],
    identifies: 'eric',
  },
  'bamala-identified': {
    scene: 'attic',
    text: 'A menina com contas no cabelo é Bamala.',
    pages: [24],
    identifies: 'bamala',
  },
  'jaymes-identified': {
    scene: 'ritual',
    text: 'O espírito invocado no ritual é Jaymes Gloamhale.',
    pages: [24, 25],
    identifies: 'jaymes',
  },
  'chant-found': {
    scene: 'grotto',
    text: 'Chant foi encontrada na gruta.',
    pages: [24],
    identifies: 'chant',
  },
} as const;
export const revelationKey = z.enum(
  Object.keys(revelations) as [
    keyof typeof revelations,
    ...(keyof typeof revelations)[],
  ],
);
export const integrityEventType = 'ADVENTURE_NARRATIVE_STATE_CONFIRMED';

const presenceSchema = z.object({
  characterKey: z.string(),
  location: z.string().nullable(),
  canSpeak: z.boolean(),
});
type Presence = z.infer<typeof presenceSchema>;

export async function readNarrativeIntegrity(campaignId: string, tx: Reader) {
  const rows = await tx
    .select({ changes: gameEvents.changes })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.campaignId, campaignId),
        eq(gameEvents.type, integrityEventType),
        eq(gameEvents.visibility, 'GM_ONLY'),
      ),
    )
    .orderBy(asc(gameEvents.sequence));
  const presence = new Map<string, Presence>();
  const revealed = new Set<keyof typeof revelations>();
  for (const { changes } of rows) {
    const state = presenceSchema.safeParse(changes.presence);
    if (state.success) presence.set(state.data.characterKey, state.data);
    const key = revelationKey.safeParse(changes.revelation);
    if (key.success) revealed.add(key.data);
  }
  return {
    presence,
    revealed,
    jaymesBanished: rows.some(({ changes }) => changes.jaymesBanished === true),
    chantMissingRecorded: rows.some(
      ({ changes }) => changes.chantMissing === true,
    ),
  };
}
export type NarrativeIntegrity = Awaited<
  ReturnType<typeof readNarrativeIntegrity>
>;

const restrictedIdentities = new Set(['erila', 'eric', 'bamala', 'jaymes']);
export function scenePresence(
  scene: Scene,
  key: string,
  state: NarrativeIntegrity,
) {
  if (
    (key === 'chant' && scene.key === 'losing-chant') ||
    (key === 'jaymes' && state.jaymesBanished)
  )
    return { present: false, canSpeak: false };
  const position = state.presence.get(key);
  if (position)
    return {
      present: position.location === scene.locationKey,
      canSpeak: position.canSpeak,
    };
  const present =
    scene.characterKeys.includes(key) &&
    !(key === 'chant' && scene.key === 'grotto') &&
    !(
      key === 'enit' &&
      scene.key === 'harvest' &&
      !state.chantMissingRecorded
    ) &&
    !(scene.key === 'resolution' && restrictedIdentities.has(key));
  return { present, canSpeak: present };
}

export function sceneIdentifies(scene: Scene, key: string) {
  return (
    !restrictedIdentities.has(key) &&
    !(key === 'chant' && scene.key === 'losing-chant')
  );
}

export function disclosedLocation(
  location: AdventureDefinition['locations'][number],
  state: NarrativeIntegrity,
) {
  for (const key of state.revealed) {
    const fact = revelations[key];
    if ('location' in fact && fact.location === location.key)
      return fact.description;
  }
  return location.description;
}

export const gloamhaleScenePolicy: ScenePolicy = {
  async read(loaded, tx) {
    const { campaignId, entityNamespace } = loaded.instance;
    const state = await readNarrativeIntegrity(campaignId, tx);
    return {
      presence: (scene, key) => scenePresence(scene, key, state),
      identifies: sceneIdentifies,
      describe: (location) => disclosedLocation(location, state),
      async activate(scene, sessionId, tx) {
        if (
          scene.key === 'losing-chant' &&
          !state.chantMissingRecorded &&
          !state.revealed.has('chant-found')
        )
          await tx.insert(gameEvents).values({
            campaignId,
            sessionId,
            commandId: adventureEntityId(
              campaignId,
              'integrity-chant-missing',
              entityNamespace,
            ),
            type: integrityEventType,
            visibility: 'GM_ONLY',
            description: 'A cena ativa confirma o desaparecimento de Chant.',
            changes: {
              chantMissing: true,
              presence: {
                characterKey: 'chant',
                location: null,
                canSpeak: false,
              },
            },
          });
      },
    };
  },
};
