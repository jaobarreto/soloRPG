import {
  narrationSchema,
  type Narration,
  type NarrativeBeat,
  type StoryCardSpeaker,
} from '@solo-rpg/shared-contracts';
import { normalizeName } from './free-action';
import type { PreparedDialogue } from './dialogue-content';

export interface RenderingContext {
  category: string;
  protagonist: { id: string; name: string } | null;
  speaker: {
    id: string;
    name?: string;
    personality?: string;
    motivations?: string;
    state?: string;
    speech?: string;
  } | null;
  scene: string | null;
  facts: { eventId: string; description: string; source?: string }[];
  rules: unknown[];
  relationships?: unknown[];
  style?: string;
  observations?: unknown[];
  inventory?: unknown[];
  objectives?: unknown[];
  publication?: { version: 1; choices: NarrativeBeat[] };
  dialogue?: PreparedDialogue;
  storyCardSpeaker?: StoryCardSpeaker;
  speakerOrigin?: 'STORY_CARD';
}
// The model selects whole approved fragments. Neither an ID nor a beat label
// authorizes new prose. This catalog is rebuilt inside the publication transaction.
export function publicationChoices(
  context: RenderingContext,
  confirmed: Narration,
): NarrativeBeat[] {
  const choices: NarrativeBeat[] = [];
  const add = (
    kind: NarrativeBeat['kind'],
    text: string,
    speakerId: string | null = null,
    factIds: string[] = [],
  ) => {
    if (text.length && text.length <= 3000)
      choices.push({ kind, text, speakerId, factIds });
  };
  add(context.category === 'OOC' ? 'OOC' : 'RESULT', confirmed.narrative);
  if (!['MECHANIC', 'DIALOGUE'].includes(context.category)) return choices;
  // These are current public descriptions, never inferred from event IDs or
  // historical NPC allegations. No arbitrary atmosphere is admitted.
  if (context.scene) add('ATMOSPHERE', context.scene);
  for (const raw of (context.observations ?? []).slice(0, 20)) {
    if (
      raw &&
      typeof raw === 'object' &&
      'description' in raw &&
      typeof raw.description === 'string' &&
      (!('accessible' in raw) || raw.accessible === true)
    )
      add('ATMOSPHERE', raw.description);
  }
  if (context.category === 'DIALOGUE' && context.speaker) {
    const speaker = context.speaker;
    const voice = normalizeName(speaker.personality ?? '');
    // Personality only selects reviewed non-material utterances, never facts.
    const opening = /cautel|desconfi|reserv/.test(voice)
      ? 'Prefiro cautela. O que despertou sua suspeita?'
      : /afetu|acolhed|gentil/.test(voice)
        ? 'Quero ouvir você. O que gostaria de me perguntar?'
        : 'Ainda tenho dúvidas. O que você pensa disso?';
    const line = (text: string, ids: string[] = []) =>
      add(
        'DIALOGUE',
        `${speaker.name ?? 'Interlocutor'} — ${text}`,
        speaker.id,
        ids,
      );
    line(opening);
    line(
      'Ainda preciso de razões para acreditar. O que sustenta essa suspeita?',
    );
    line('Não tenho uma resposta segura para isso. Pode me contar mais?');
    for (const reply of context.dialogue?.replies ?? [])
      if (reply.beat.speakerId === speaker.id) choices.push(reply.beat);
    for (const fact of context.facts) {
      const preface =
        fact.source === 'RUMOR'
          ? 'Ouvi este rumor, mas não posso confirmá-lo:'
          : fact.source === 'WITNESSED'
            ? 'Recordo o que presenciei:'
            : 'Ouvi este relato; isso não comprova que seja verdade:';
      // Quote every line. HEARD/RUMOR never becomes the narrator's assertion.
      line(
        `${preface}\n${fact.description
          .split('\n')
          .map((t) => `> ${t}`)
          .join('\n')}`,
        [fact.eventId],
      );
    }
  }
  add('QUESTION', 'O que você deseja fazer?');
  add('QUESTION', 'Como deseja prosseguir?');
  return choices;
}

const sameBeat = (a: NarrativeBeat, b: NarrativeBeat) =>
  a.kind === b.kind &&
  a.speakerId === b.speakerId &&
  a.text === b.text &&
  JSON.stringify(a.factIds) === JSON.stringify(b.factIds);

export function dialogueProvenance(
  context: RenderingContext,
  narration: Narration,
) {
  return (context.dialogue?.replies ?? [])
    .filter((r) => narration.beats?.some((b) => sameBeat(b, r.beat)))
    .map(
      ({
        id,
        libraryId,
        contentVersion,
        voiceId,
        provenance,
        bindingProvenance,
        sourceReferences,
        owner,
        manifestProvenance,
      }) => ({
        id,
        libraryId,
        contentVersion,
        voiceId,
        provenance,
        bindingProvenance,
        sourceReferences,
        ...(owner ? { owner, manifestProvenance } : {}),
      }),
    );
}

// Administrative bindings and audit provenance are not narrative material.
// The REGULAR request is unchanged. STORY_CARD selection needs only whole beats.
export function modelRendering(context: RenderingContext | null) {
  if (context?.speakerOrigin !== 'STORY_CARD') return context;
  const publicContext = { ...context };
  const dialogue = publicContext.dialogue;
  delete publicContext.storyCardSpeaker;
  delete publicContext.speakerOrigin;
  delete publicContext.dialogue;
  return {
    ...publicContext,
    ...(dialogue
      ? {
          dialogue: {
            version: dialogue.version,
            selection: dialogue.selection,
            replies: dialogue.replies.map((r) => ({ beat: r.beat })),
          },
        }
      : {}),
  };
}

export function validateRendering(
  raw: unknown,
  confirmed: Narration,
  context: RenderingContext,
): { accepted: boolean; narration: Narration; reason: string | null } {
  // Never trust a catalog echoed by the generator. Rebuild from current sources.
  const choices = publicationChoices(context, confirmed);
  const fallback = (): Narration => {
    const reply = choices.find(
      (b) => b.kind === 'DIALOGUE' && !b.factIds.length,
    );
    return context.category === 'DIALOGUE' && reply
      ? { narrative: reply.text, eventIds: confirmed.eventIds, beats: [reply] }
      : confirmed;
  };
  const reject = (reason: string) => ({
    accepted: false,
    narration: fallback(),
    reason,
  });
  const parsed = narrationSchema.safeParse(raw);
  if (!parsed.success) return reject('INVALID_SCHEMA');
  const draft = parsed.data;
  if (JSON.stringify(draft.eventIds) !== JSON.stringify(confirmed.eventIds))
    return reject('EVENT_REFERENCES');
  if (['OOC', 'QUERY', 'OBSERVE'].includes(context.category)) {
    if (draft.narrative !== confirmed.narrative)
      return reject('UNGROUNDED_INFORMATION');
    if (draft.beats?.some((b) => !choices.some((c) => sameBeat(b, c))))
      return reject('INFORMATION_BOUNDARY');
    return { accepted: true, narration: confirmed, reason: null };
  }
  if (draft.narrative === confirmed.narrative && !draft.beats) {
    // An old/invalid generator can still return confirmed; dialogue gets a safe
    // attributed reply rather than a technical acknowledgement, without a call.
    if (context.category === 'DIALOGUE' && context.speaker)
      return reject('MISSING_REPLY');
    return { accepted: true, narration: confirmed, reason: null };
  }
  if (
    !draft.beats ||
    draft.narrative !== draft.beats.map((b) => b.text).join('\n\n')
  )
    return reject('BEAT_TEXT');
  if (['CLARIFY', 'ADJUDICATE', 'THINK'].includes(context.category))
    return reject('DETERMINISTIC_ONLY');
  const results = draft.beats.filter((b) => b.kind === 'RESULT');
  if (
    (context.category === 'MECHANIC' && results.length !== 1) ||
    results.some(
      (b) =>
        b.text !== confirmed.narrative ||
        b.speakerId !== null ||
        b.factIds.length,
    )
  )
    return reject('OFFICIAL_RESULT');
  const selected: NarrativeBeat[] = [];
  // Each contextual reply is a reviewed complete utterance. Combining alternatives
  // is not authorized merely because both strings separately appear in the catalog.
  if (
    context.category === 'DIALOGUE' &&
    context.dialogue?.selection &&
    draft.beats.filter((b) => b.kind === 'DIALOGUE').length !== 1
  )
    return reject('DIALOGUE_ALTERNATIVES');
  for (const beat of draft.beats) {
    if (beat.kind === 'OOC') return reject('OOC_BOUNDARY');
    if (beat.speakerId !== null && beat.speakerId !== context.speaker?.id)
      return reject('SPEAKER');
    if (beat.factIds.some((id) => !context.facts.some((f) => f.eventId === id)))
      return reject('UNOWNED_KNOWLEDGE');
    const authorized = choices.find((c) => sameBeat(beat, c));
    if (!authorized) return reject('UNAPPROVED_SEGMENT');
    if (selected.some((b) => sameBeat(b, authorized)))
      return reject('REPEATED_SEGMENT');
    selected.push(authorized);
  }
  if (
    context.category === 'DIALOGUE' &&
    !selected.some((b) => b.kind === 'DIALOGUE')
  )
    return reject('MISSING_REPLY');
  // Only server-owned strings cross the boundary, even when all text matched.
  const assembled = narrationSchema.safeParse({
    narrative: selected.map((b) => b.text).join('\n\n'),
    eventIds: confirmed.eventIds,
    beats: selected,
  });
  if (!assembled.success) return reject('PUBLICATION_LIMIT');
  return { accepted: true, narration: assembled.data, reason: null };
}
