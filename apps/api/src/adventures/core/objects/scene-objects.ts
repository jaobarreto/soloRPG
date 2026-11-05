import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../../database/database.service';
import {
  characters,
  characterVitals,
  gameCommands,
  gameEvents,
} from '../../../database/game-schema';
import { sessionMessages } from '../../../database/schema';
import { spatialState } from '../navigation/spatial';
import { adventureEntityId, digest } from '../state/identity';
import { loadAdventure, type Reader } from '../state/state';
import type { AdventureRegistry } from '../registry/registry';

export interface SceneObject {
  key: string;
  aliases: readonly string[];
  name: string;
  locationKey: string;
  presence: 'AFTER_TRAVEL_REVEAL' | 'AT_LOCATION';
  source: { book: string; page: number; section: string };
  initialState: string;
  visibleFacts: readonly string[];
  examinationFacts: readonly string[];
  perceptible: string;
  examined: string;
  recognized: string;
  privateNotes?: string;
}

export interface SceneObjectRelease {
  revision: string;
  objects: readonly SceneObject[];
}

export const objectExaminationEvent = 'ADVENTURE_OBJECT_EXAMINED' as const;

const receiptId = (campaignId: string) =>
  adventureEntityId(campaignId, 'scene-objects-v1', 'adventure-release');

export async function pinSceneObjects(
  campaignId: string,
  release: SceneObjectRelease,
  tx: DatabaseTransaction,
) {
  await tx.insert(gameCommands).values({
    campaignId,
    commandId: receiptId(campaignId),
    digest: digest(release),
    result: { revision: release.revision },
  });
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

type Intent = {
  kind: 'OBSERVE' | 'EXAMINE' | 'CHECK' | 'QUESTION';
  target: string;
};

export function objectIntent(mode: string | null, raw: string): Intent | null {
  const text = normalize(raw).replace(/[.!?]+$/, '');
  if (mode === 'OUT_OF_CHARACTER') {
    const question =
      /^(?:una,? )?(?:(?:o que )?(?:[\p{L}]+ )?(?:consigo|consegue|posso|pode) (?:ver|observar|perceber)(?: daqui)?|(?:como e|o que vejo (?:n[oa]|em)) (.+))$/u.exec(
        text,
      );
    return question ? { kind: 'QUESTION', target: question[1] ?? '' } : null;
  }
  if (mode === 'REQUEST_CHECK') {
    const test =
      /\b(?:para )?(?:examinar|inspecionar|investigar|observar|verificar) (.+)$/u.exec(
        text,
      );
    return test ? { kind: 'CHECK', target: test[1]! } : null;
  }
  if (mode !== 'ACT') return null;
  const match =
    /^(?:(?:eu )?(?:quero|vou|tento|pretendo|posso) |eu )?(examino|examinar|inspeciono|inspecionar|verifico|verificar|observo|observar|olho|olhar|dou uma olhada|dar uma olhada)\b\s*(.*)$/u.exec(
      text,
    );
  if (!match) return null;
  return {
    kind:
      raw.trim().endsWith('?') || text.startsWith('posso ')
        ? 'QUESTION'
        : /^(observ|olh|dou |dar )/.test(match[1]!)
          ? 'OBSERVE'
          : 'EXAMINE',
    target: match[2]!,
  };
}

export function matchSceneObject<T extends { aliases: readonly string[] }>(
  objects: readonly T[],
  target: string,
) {
  const name = normalize(target)
    .replace(
      /^(?:(?:de perto|com cuidado) )?(?:(?:para|em) )?(?:a |o |na |no |essa |esta |esse |este |aquela |aquele |nesta |nessa |naquela )?/,
      '',
    )
    .replace(/ (?:de perto|com cuidado|mais de perto|da estrada)$/, '');
  const possible =
    !name || /^(isso|isto|aquilo|objeto)$/.test(name)
      ? objects
      : objects.filter((entry) =>
          entry.aliases.some((alias) => normalize(alias) === name),
        );
  if (possible.length === 1)
    return { kind: 'MATCH' as const, object: possible[0]! };
  return {
    kind: possible.length ? ('AMBIGUOUS' as const) : ('UNAVAILABLE' as const),
  };
}

export async function pinnedSceneObjects(
  campaignId: string,
  tx: Reader,
  registry: AdventureRegistry,
) {
  const [receipt] = await tx
    .select({ result: gameCommands.result, digest: gameCommands.digest })
    .from(gameCommands)
    .where(
      and(
        eq(gameCommands.campaignId, campaignId),
        eq(gameCommands.commandId, receiptId(campaignId)),
      ),
    );
  if (!receipt) return null;
  const loaded = await loadAdventure(campaignId, tx);
  if (!loaded) return null;
  const release = registry
    .forDefinition(loaded.definition)
    .guidedRelease?.sceneObjects?.find(
      (candidate) => candidate.revision === receipt.result.revision,
    );
  return release && digest(release) === receipt.digest
    ? { release, loaded }
    : null;
}

export async function resolveSceneObject(
  campaignId: string,
  sessionId: string,
  intent: Intent,
  tx: Reader,
  catalog: NonNullable<Awaited<ReturnType<typeof pinnedSceneObjects>>>,
) {
  const { release, loaded } = catalog;
  const [presentation] = await tx
    .select({ id: sessionMessages.id })
    .from(sessionMessages)
    .where(
      and(
        eq(sessionMessages.campaignId, campaignId),
        eq(sessionMessages.sessionId, sessionId),
        eq(sessionMessages.role, 'GAME_MASTER'),
        sql`${sessionMessages.metadata}->>'travelRevealed' = 'true'`,
        sql`(${sessionMessages.metadata}->>'batchFragment') IS NULL`,
      ),
    )
    .limit(1);
  const position = await spatialState(loaded, tx);
  const place = position?.current && position.byKey.get(position.current);
  const available =
    place &&
    place.accessible &&
    place.visibility !== 'GM_ONLY' &&
    !['BURNED', 'FLOODED', 'DESTROYED'].includes(place.status)
      ? release.objects.filter(
          (entry) =>
            entry.locationKey === position.current &&
            (entry.presence === 'AT_LOCATION' || !!presentation),
        )
      : [];
  const target = matchSceneObject(available, intent.target);
  if (target.kind !== 'MATCH')
    return {
      text:
        target.kind === 'AMBIGUOUS'
          ? 'Qual dos objetos você quer observar ou examinar?'
          : 'Qual objeto você quer observar ou examinar? Esse alvo ainda não está identificado e acessível daqui.',
    };

  const object = target.object;
  if (intent.kind === 'CHECK')
    return {
      text: 'O exame simples desse objeto não exige rolagem. Nenhum teste adicional está preparado para essa tentativa.',
    };
  if (intent.kind !== 'EXAMINE') return { text: object.perceptible };

  const protagonistId = loaded.instance.protagonistId;
  const [actor] = protagonistId
    ? await tx
        .select({ id: characters.id })
        .from(characters)
        .innerJoin(
          characterVitals,
          eq(characterVitals.characterId, characters.id),
        )
        .where(
          and(
            eq(characters.campaignId, campaignId),
            eq(characters.id, protagonistId),
            eq(characterVitals.living, true),
            eq(characterVitals.lifeState, 'ALIVE'),
          ),
        )
    : [];
  if (!actor)
    return {
      text: 'A protagonista não está em condições de examinar o objeto.',
    };

  const id = adventureEntityId(
    campaignId,
    `object-${object.key}`,
    loaded.instance.entityNamespace,
  );
  const commandId = adventureEntityId(
    campaignId,
    `examine-${release.revision}-${object.key}`,
    loaded.instance.entityNamespace,
  );
  const [known] = await tx
    .select({ id: gameEvents.id })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.campaignId, campaignId),
        eq(gameEvents.commandId, commandId),
        eq(gameEvents.type, objectExaminationEvent),
      ),
    )
    .limit(1);
  if (known) return { text: object.recognized };

  return {
    text: object.examined,
    examination: {
      id,
      commandId,
      revision: release.revision,
      protagonistId: actor.id,
    },
  };
}
