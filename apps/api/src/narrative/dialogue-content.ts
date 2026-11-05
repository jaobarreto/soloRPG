import { createHash } from 'node:crypto';
import {
  dialogueBindingSchema,
  type DialogueBinding,
  type DialogueSelection,
  type NarrativeBeat,
  type StoryCardSpeaker,
} from '@solo-rpg/shared-contracts';

export interface DialogueSource {
  kind: 'KNOWLEDGE' | 'PUBLIC';
  referenceId: string;
  description: string;
  visibility: string;
  characterId?: string;
  source?: string;
  eventType?: string;
  participants?: string[];
  accessible?: boolean;
}
export interface DialogueSpeaker {
  id: string;
  name: string;
  state: string;
  available: boolean;
}
type Voice = DialogueBinding['voiceId'];
type Act = DialogueSelection['act'];
interface Fragment {
  id: string;
  topic: DialogueSelection['topic'];
  act: Act;
  voiceId: Voice;
  text: string;
  requiredState?: string;
  requires?: {
    key: DialogueBinding['sources'][number]['key'];
    kind: DialogueSource['kind'];
    source?: string;
    eventType?: string;
    speakerMustParticipate?: boolean;
  };
}
export interface AuthorizedReply {
  owner?: StoryCardSpeaker;
  manifestProvenance?: DialogueBinding['provenance'];
  id: string;
  libraryId: 'khaos-dialogue';
  contentVersion: 1;
  voiceId: Voice;
  topic: string;
  act: Act;
  provenance: DialogueBinding['provenance'];
  bindingProvenance: DialogueBinding['provenance'];
  sourceReferences: {
    kind: string;
    referenceId: string;
    descriptionHash: string;
  }[];
  beat: NarrativeBeat;
}
export interface PreparedDialogue {
  version: 1;
  selection: DialogueSelection | null;
  replies: AuthorizedReply[];
}
const provenance = {
  authorId: 'khaos-reviewed-dialogue',
  source: 'content:khaos-dialogue/v1',
  reviewed: true as const,
};
const fragments: Fragment[] = [];
const add = (
  topic: string,
  act: Act,
  texts: Record<Voice, string[]>,
  conditions: Pick<Fragment, 'requiredState' | 'requires'> = {},
) => {
  for (const voiceId of ['RESERVED', 'WARM'] as const)
    for (const [i, text] of texts[voiceId].entries())
      fragments.push({
        id: `${topic}-${act.toLowerCase()}-${voiceId.toLowerCase()}-${i + 1}`,
        topic,
        act,
        voiceId,
        text,
        ...conditions,
      });
};
add('conversation', 'ANSWER', {
  RESERVED: [
    'Prefiro esclarecer um ponto de cada vez. Podemos começar pelo que ficou menos claro.',
    'Quero distinguir o que você está perguntando do que ainda precisa ser decidido. Assim consigo responder com mais cuidado.',
  ],
  WARM: [
    'Podemos conversar com clareza, sem exigir que você concorde comigo. Qual ponto você quer que eu explique?',
    'Quero ouvir seu ponto e explicar o meu. Não precisamos transformar esta conversa em um acordo.',
  ],
});
add('conversation', 'DOUBT', {
  RESERVED: [
    'Ainda não tenho elementos para tratar uma suspeita como certeza.',
  ],
  WARM: [
    'Posso ouvir a suspeita, mas não quero confundir o que foi dito com o que foi confirmado.',
  ],
});
add('conversation', 'DISAGREE', {
  RESERVED: [
    'Não concordo em tomar uma acusação como prova. Prefiro separar as duas coisas.',
  ],
  WARM: [
    'Quero entender a acusação sem tratá-la como uma verdade já demonstrada.',
  ],
});
add('conversation', 'CLARIFY', {
  RESERVED: [
    'Qual ponto você quer esclarecer? Prefiro perguntar a preencher o silêncio com uma suposição.',
  ],
  WARM: ['Diga qual parte quer esclarecer, e podemos nos concentrar nela.'],
});
add('conversation', 'CAUTION', {
  RESERVED: [
    'Prefiro pesar o que sabemos antes de ir além. Ouvir você não é confirmar uma conclusão.',
  ],
  WARM: [
    'Quero conversar sem adiantar uma conclusão. Podemos separar o que sabemos do que ainda falta entender.',
  ],
});
add('conversation', 'RESUME', {
  RESERVED: [
    'Diga qual ponto quer retomar; não quero preencher as lacunas por você.',
  ],
  WARM: ['Podemos retomar a conversa. Qual ponto você quer trazer de volta?'],
});
add('conversation', 'REFUSE', {
  RESERVED: ['Não vou prometer uma ajuda que ainda não foi decidida.'],
  WARM: [
    'Posso conversar sobre o pedido, mas não quero oferecer uma promessa de ajuda só para tornar esta resposta mais fácil.',
  ],
});
add('conversation', 'UNKNOWN', {
  RESERVED: [
    'Não tenho elementos para afirmar isso. Pode esclarecer o que você quer saber?',
  ],
  WARM: [
    'Não tenho uma resposta segura para isso. Prefiro pedir que esclareça a inventar uma explicação.',
  ],
});
const disagreement = {
  requiredState: 'UNRESOLVED',
  requires: {
    key: 'disagreement' as const,
    kind: 'KNOWLEDGE' as const,
    source: 'WITNESSED',
    eventType: 'CONSEQUENCE_RECORDED',
    speakerMustParticipate: true,
  },
};
add(
  'disagreement',
  'ANSWER',
  {
    RESERVED: [
      'Não considero aquele desacordo resolvido. Prefiro esclarecer o que ficou entre nós antes de chamar isso de acordo.',
      'Meu ponto é este: a discussão aconteceu, e não vou tratá-la como encerrada apenas porque voltamos a conversar.',
    ],
    WARM: [
      'Quero falar disso com clareza. Ainda temos um desacordo, e ouvir você não significa que já esteja tudo resolvido.',
      'Podemos olhar para o que aconteceu sem fingir que houve uma reconciliação. Retomar a conversa não apaga o desacordo.',
    ],
  },
  disagreement,
);
add(
  'disagreement',
  'RESUME',
  {
    RESERVED: [
      'Retomo aquele desacordo sem presumir que tenha sido resolvido. Posso explicar meu ponto sem pedir que você o aceite.',
    ],
    WARM: [
      'Podemos voltar àquela discussão. Quero manter espaço para conversar, sem dizer que isso já nos reconciliou.',
    ],
  },
  disagreement,
);
add(
  'disagreement',
  'DISAGREE',
  {
    RESERVED: [
      'Não concordo em chamar essa retomada de reconciliação. O desacordo continua em aberto.',
    ],
    WARM: [
      'Quero conversar, mas não seria correto dizer que o desacordo já acabou.',
    ],
  },
  disagreement,
);
add(
  'disagreement',
  'REFUSE',
  {
    RESERVED: [
      'Não confirmo uma reconciliação apenas por um pedido de perdão. Prefiro manter claro o que ainda está em aberto.',
    ],
    WARM: [
      'Posso ouvir o pedido de perdão sem dizer que o desacordo já foi resolvido. Uma coisa não confirma a outra.',
    ],
  },
  disagreement,
);
const promise = {
  requires: {
    key: 'promise' as const,
    kind: 'KNOWLEDGE' as const,
    source: 'HEARD',
    eventType: 'SPEECH_RECORDED',
  },
};
add(
  'promise',
  'ANSWER',
  {
    RESERVED: [
      'Da promessa, posso retomar o que ouvi; não um resultado confirmado:\n{{source}}',
    ],
    WARM: [
      'Posso retomar essa promessa com você. Ela foi dita; isso não mostra, por si só, que foi cumprida:\n{{source}}',
    ],
  },
  promise,
);
add(
  'promise',
  'RESUME',
  {
    RESERVED: [
      'Volto ao relato da promessa, sem tratá-la como algo já realizado:\n{{source}}',
    ],
    WARM: [
      'Podemos voltar ao que foi prometido, conservando a diferença entre dizer e fazer:\n{{source}}',
    ],
  },
  promise,
);
add(
  'surroundings',
  'ANSWER',
  {
    RESERVED: ['Por enquanto, fico com o que está à vista:\n{{source}}'],
    WARM: [
      'Podemos começar pelo que está à vista, sem acrescentar o que ainda não descobrimos:\n{{source}}',
    ],
  },
  { requires: { key: 'surroundings', kind: 'PUBLIC' } },
);

// Hashes bind a reviewed topic/source association to exact current content. They
// prove identity, not meaning: the local preparer remains responsible for authorship.
export function dialogueSourceHash(description: string) {
  return createHash('sha256').update(description).digest('hex');
}
export function authorizeDialogue(
  binding: unknown,
  speaker: DialogueSpeaker,
  sources: DialogueSource[],
): AuthorizedReply[] {
  const parsed = dialogueBindingSchema.safeParse(binding);
  if (
    !parsed.success ||
    !speaker.available ||
    parsed.data.characterId !== speaker.id ||
    parsed.data.expectedState !== speaker.state
  )
    return [];
  const b = parsed.data;
  // Ambiguous aliases are refused rather than selecting one source arbitrarily.
  if (new Set(b.sources.map((s) => s.key)).size !== b.sources.length) return [];
  const replies: AuthorizedReply[] = [];
  for (const fragment of fragments) {
    if (
      fragment.voiceId !== b.voiceId ||
      !b.topics.includes(fragment.topic as DialogueBinding['topics'][number]) ||
      (fragment.requiredState && fragment.requiredState !== speaker.state)
    )
      continue;
    let source: DialogueSource | undefined;
    if (fragment.requires) {
      const required = fragment.requires;
      const link = b.sources.find(
        (s) => s.key === required.key && s.kind === required.kind,
      );
      if (!link) continue;
      source = sources.find(
        (s) =>
          s.referenceId === link.referenceId &&
          s.kind === link.kind &&
          s.visibility === 'PUBLIC' &&
          dialogueSourceHash(s.description) === link.descriptionHash &&
          (s.kind === 'PUBLIC'
            ? s.accessible === true
            : s.characterId === speaker.id &&
              s.source === required.source &&
              s.eventType === required.eventType &&
              (!required.speakerMustParticipate ||
                s.participants?.includes(speaker.id) === true)),
      );
      if (!source) continue;
    }
    const text = `${speaker.name} — ${fragment.text.replace(
      '{{source}}',
      () =>
        source?.description
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') ?? '',
    )}`;
    if (text.length > 3000) continue;
    replies.push({
      id: fragment.id,
      libraryId: 'khaos-dialogue',
      contentVersion: 1,
      voiceId: b.voiceId,
      topic: fragment.topic,
      act: fragment.act,
      provenance,
      bindingProvenance: b.provenance,
      sourceReferences: source
        ? [
            {
              kind: source.kind,
              referenceId: source.referenceId,
              descriptionHash: dialogueSourceHash(source.description),
            },
          ]
        : [],
      beat: {
        kind: 'DIALOGUE',
        speakerId: speaker.id,
        text,
        factIds: source?.kind === 'KNOWLEDGE' ? [source.referenceId] : [],
      },
    });
  }
  return replies;
}
