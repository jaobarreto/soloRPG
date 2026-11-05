import { and, eq, max } from 'drizzle-orm';
import {
  characterVitals,
  combatEncounters,
  gameEvents,
} from '../../../database/game-schema';
import type { DatabaseTransaction } from '../../../database/database.service';
import type { LoadedAdventure } from '../state/state';
import type { ScenePolicy } from '../registry/scene-policy';
import {
  spatialArrival,
  spatialState,
  detachSpatialEncounter,
  recordSpatialChange,
} from './spatial';

type Exit = NonNullable<
  Awaited<ReturnType<typeof spatialState>>
>['exits'][number];

export interface NavigationPolicy {
  aliases?: Readonly<Record<string, string>>;
  protagonistLabel: string;
  matchesExit?(text: string, exit: Exit): boolean;
  traversalBlock?(
    loaded: LoadedAdventure,
    from: string,
    to: string,
  ): string | undefined;
  arrive?(
    loaded: LoadedAdventure,
    destination: string,
    tx: DatabaseTransaction,
  ): Promise<void>;
  partyMemberPresent?(
    state: Record<string, unknown> | null,
    characterId: string,
    location: string,
  ): boolean;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[.!]$/, '');
const movement =
  /^(?:quero )?(?:ir|vou|entro|entrar|volto|voltar|subo|subir|desco|descer|atravesso|atravessar|saio|sair)(?:\s+(.+))?$/;

export async function navigate(
  loaded: LoadedAdventure,
  sessionId: string,
  actionId: string,
  input: { mode: string | null; text: string; selected: unknown },
  tx: DatabaseTransaction,
  policy: NavigationPolicy,
  scenePolicy?: ScenePolicy,
) {
  const state = await spatialState(loaded, tx, policy.aliases);
  if (!state?.current || input.mode !== 'ACT') return null;
  const text = normalize(input.text);
  const match = movement.exec(text);
  const selected =
    typeof input.selected === 'string' &&
    state.exits.find((e) => e.id === input.selected);
  if (input.selected && !selected) return null;
  if (!selected && (!match || text.includes('?'))) return null;
  const phrase =
    match?.[1]?.replace(
      /^(?:pela porta que leva |pela |pelo |para |na |no |ao |a |o |em |de |da |do )+/,
      '',
    ) ?? '';
  const choices = selected
    ? [selected]
    : state.exits.filter((e) =>
        /^(?:sala|local|ambiente) anterior$/.test(phrase) ||
        text === 'volto' ||
        text === 'voltar'
          ? e.to === state.previous
          : /^(?:a )?escada$/.test(phrase) &&
              /\b(?:subo|subir|desco|descer)\b/.test(text)
            ? e.edge.kind === 'STAIRS' &&
              e.reverse === /\b(?:desco|descer)\b/.test(text)
            : (!!e.to &&
                phrase === normalize(policy.aliases?.[e.to] ?? e.to)) ||
              phrase === normalize(e.edge.label) ||
              policy.matchesExit?.(text, e),
      );
  const protagonist = policy.protagonistLabel;
  if (choices.length !== 1)
    return {
      text: `Qual passagem conhecida ${protagonist} deseja usar? Você pode escolher uma das saídas disponíveis.`,
      eventIds: [],
    };
  const choice = choices[0]!;
  if (choice.status !== 'OPEN' || !choice.to)
    return {
      text:
        choice.status === 'LOCAL'
          ? `Esta passagem exige confirmação local das condições de travessia. ${protagonist} permanece onde está.`
          : `Esta passagem está bloqueada. ${protagonist} permanece onde está.`,
      eventIds: [],
    };
  const protagonistId = loaded.instance.protagonistId;
  const [vitals] = protagonistId
    ? await tx
        .select()
        .from(characterVitals)
        .where(eq(characterVitals.characterId, protagonistId))
    : [];
  const [combat] = await tx
    .select({ id: combatEncounters.id })
    .from(combatEncounters)
    .where(
      and(
        eq(combatEncounters.campaignId, loaded.instance.campaignId),
        eq(combatEncounters.status, 'ACTIVE'),
      ),
    )
    .limit(1);
  if (!vitals || !vitals.living || vitals.lifeState !== 'ALIVE' || combat)
    return {
      text: 'O estado atual exige resolver a situação em andamento antes de atravessar a passagem.',
      eventIds: [],
    };
  const blocked = policy.traversalBlock?.(loaded, state.current, choice.to);
  if (blocked) return { text: blocked, eventIds: [] };
  const destination = loaded.definition.locations.find(
    (l) => l.key === choice.to,
  )!;
  const visibility = await scenePolicy?.read(loaded, tx);
  await spatialArrival(loaded, sessionId, destination.key, tx, actionId);
  await policy.arrive?.(loaded, destination.key, tx);
  if (choice.edge.uphillOnly && !choice.reverse)
    await recordSpatialChange(
      loaded,
      sessionId,
      actionId,
      { passage: choice.edge.key, open: false },
      'Autorização de subida consumida.',
      tx,
    );
  const opening = visibility?.describe(destination) ?? destination.description;
  await detachSpatialEncounter(loaded, sessionId, opening, tx);
  const narrative = `${protagonist} chega a ${destination.name}. ${opening}`;
  const [last] = await tx
    .select({ sequence: max(gameEvents.publicSequence) })
    .from(gameEvents)
    .where(eq(gameEvents.campaignId, loaded.instance.campaignId));
  const [event] = await tx
    .insert(gameEvents)
    .values({
      campaignId: loaded.instance.campaignId,
      sessionId,
      commandId: actionId,
      type: 'ADVENTURE_LOCATION_ENTERED',
      description: narrative,
      visibility: 'PUBLIC',
      publicSequence: (last?.sequence ?? 0) + 1,
      changes: {
        locationId: state.byKey.get(destination.key)!.id,
        revisited: state.visits.has(destination.key),
      },
    })
    .returning();
  return { text: narrative, eventIds: [event!.id] };
}
