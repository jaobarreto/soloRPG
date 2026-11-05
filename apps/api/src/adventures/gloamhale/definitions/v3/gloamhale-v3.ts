import { adventureDefinitionSchema } from '../../../core/definitions/definition';
import { gloamhaleV2 } from '../v2/gloamhale-v2';
import type {
  Condition,
  Progression,
} from '../../../core/director/progression';

const revised = structuredClone(gloamhaleV2);
revised.version = 3;
// Three published parts (SoS pp.7–26), not a target number of play sittings.
const chapters = revised.sessions;
revised.sessions = [
  { ...chapters[0]!, title: 'A vila', sceneKeys: chapters[0]!.sceneKeys },
  { ...chapters[1]!, title: 'O pântano', sceneKeys: chapters[1]!.sceneKeys },
  {
    ...chapters[2]!,
    title: 'O solar',
    sceneKeys: [...chapters.slice(2).flatMap((s) => s.sceneKeys), 'grotto'],
  },
].map((s, i) => {
  delete s.targetMinutes;
  delete s.completionEvidence;
  return { ...s, number: i + 1 };
});
for (const [index, session] of revised.sessions.entries()) {
  session.mainObjective = [
    'Resolver o contato inicial e decidir como prosseguir na investigação.',
    'Localizar um caminho confirmado até o solar respeitando decisões e consequências.',
    'Determinar um desfecho válido e registrar separadamente suas consequências.',
  ][index]!;
  session.secondaryObjectives = [
    [
      'Conhecer Chant quando houver oportunidade, sem impor memórias à protagonista.',
    ],
    ['Ouvir os Fen quando esse caminho for escolhido.'],
    [
      'Investigar documentos, procurar sobreviventes e avaliar as opções sem exigir ritual.',
    ],
  ][index]!;
  session.milestones = [
    ['Contato inicial resolvido', 'Decisão sobre o caminho'],
    ['Acesso à próxima etapa confirmado'],
    [
      'Destino dos sobreviventes apurado',
      'Consequências e desfecho confirmados',
    ],
  ][index]!;
  session.completionCriteria = [
    'Satisfazer a expressão de progression desta unidade por provas oficiais, ou confirmar uma retirada definitiva com consequências.',
  ];
  session.possibleEndings = [
    'Continuidade autorizada pelos objetivos da unidade',
    'Retirada definitiva escolhida e atestada',
  ];
}
const fact = (reference: string): Condition => ({ type: 'FACT', reference });
const option = (sceneKey: string, optionKey: string): Condition => ({
  type: 'OPTION',
  sceneKey,
  optionKey,
});
const any = (...conditions: Condition[]): Condition => ({
  operator: 'ANY',
  conditions,
});
const all = (...conditions: Condition[]): Condition => ({
  operator: 'ALL',
  conditions,
});
const facts: Progression['facts'] = [
  {
    key: 'village-route',
    unitKey: 'village',
    description:
      'Encontro da estrada resolvido; decisão oficial de prosseguir diretamente ao pântano (p.8).',
    sourcePages: [7, 8],
  },
  {
    key: 'swamp-route',
    unitKey: 'swamp',
    description:
      'Pistas ou exploração confirmadas permitem alcançar o solar, inclusive sem audiência com a Mud Mother.',
    sourcePages: [11, 12, 13, 14],
  },
  {
    key: 'fen-contact',
    unitKey: 'swamp',
    description:
      'Posição dos Fen e consequências do contato confirmadas, sem exigir aliança.',
    sourcePages: [11, 12, 13],
  },
  {
    key: 'fen-refusal',
    unitKey: 'swamp',
    description:
      'Recusa ou violência oficialmente resolvida; acampamento/represália dependem da decisão efetiva.',
    sourcePages: [12, 13],
  },
  {
    key: 'sanatorium-evidence',
    unitKey: 'manor',
    description: 'Evidências autorizadas do antigo sanatório registradas.',
    sourcePages: [14, 15, 20, 21],
  },
  {
    key: 'children-accounted',
    unitKey: 'manor',
    description:
      'Destino dos sobreviventes confirmado; não equivale necessariamente a resgate bem-sucedido.',
    sourcePages: [23, 24],
  },
  {
    key: 'haints-freed',
    unitKey: 'manor',
    description:
      'Todos os haints libertados; repercussões regionais distintas dos destinos da casa e de Erila.',
    sourcePages: [26],
    exclusiveGroup: 'haints',
  },
  {
    key: 'haints-remain',
    unitKey: 'manor',
    description: 'Permanecem haints e consequências correspondentes.',
    sourcePages: [26],
    exclusiveGroup: 'haints',
  },
  {
    key: 'manor-flooded',
    unitKey: 'manor',
    description:
      'Inundação e consequências mecânicas/regionais confirmadas localmente.',
    sourcePages: [26],
    exclusiveGroup: 'manor',
  },
  {
    key: 'manor-burned',
    unitKey: 'manor',
    description:
      'Incêndio e consequências confirmadas; não liberta automaticamente todos os espíritos.',
    sourcePages: [26],
    exclusiveGroup: 'manor',
  },
  {
    key: 'manor-standing',
    unitKey: 'manor',
    description:
      'Casa permanece; efeitos residuais foram explicitamente registrados.',
    sourcePages: [26],
    exclusiveGroup: 'manor',
  },
  {
    key: 'erila-accounted',
    unitKey: 'manor',
    description:
      'Destino de Erila conferido separadamente conforme haints e destruição da casa.',
    sourcePages: [26],
  },
  {
    key: 'jaymes-accounted',
    unitKey: 'manor',
    description:
      'Destino de Jaymes conferido sem inferir banimento da destruição da casa.',
    sourcePages: [25, 26],
  },
  {
    key: 'aftermath-confirmed',
    unitKey: 'manor',
    description:
      'Consequências persistidas e conferidas separadamente para vila/Fen, casa, crianças e espíritos.',
    sourcePages: [26],
    requires: all(
      fact('children-accounted'),
      any(fact('haints-freed'), fact('haints-remain')),
      any(fact('manor-flooded'), fact('manor-burned'), fact('manor-standing')),
      fact('erila-accounted'),
      fact('jaymes-accounted'),
    ),
  },
  ...['village', 'swamp', 'manor'].map((unitKey) => ({
    key: `withdraw-${unitKey}`,
    unitKey,
    description:
      'Retirada definitiva escolhida pela jogadora e consequências atestadas pelo operador. Política SoloRPG para recusa; não equivale a vitória.',
    sourcePages: [8, 13, 26],
  })),
];
const main = (
  key: string,
  description: string,
  completion: Condition,
  publicDescription?: string,
) => ({
  key,
  type: 'MAIN' as const,
  description,
  completion,
  weight: 1,
  ...(publicDescription ? { publicDescription } : {}),
});
const villageDone = any(
  all(option('foiled-trap', 'ask-villagers'), option('village', 'investigate')),
  fact('village-route'),
);
const swampDone = fact('swamp-route');
const manorDone = fact('aftermath-confirmed');
revised.progression = {
  facts,
  units: [
    {
      key: 'village',
      weight: 1,
      objectives: [
        main(
          'reports',
          'Ouvir relatos ou resolver o contato inicial por caminho alternativo.',
          any(option('foiled-trap', 'ask-villagers'), fact('village-route')),
          'Compreender a situação local',
        ),
        main(
          'decision',
          'Decisão confirmada de investigação ou acesso ao pântano.',
          villageDone,
          'Decidir como prosseguir',
        ),
        {
          ...main(
            'chant',
            'Contato com Chant não é obrigatório.',
            fact('chant-contact'),
          ),
          type: 'OPTIONAL',
        },
      ],
      milestones: [
        {
          key: 'reports',
          weight: 1,
          completion: any(
            option('foiled-trap', 'ask-villagers'),
            fact('village-route'),
          ),
        },
        { key: 'decision', weight: 1, completion: villageDone },
      ],
      completion: villageDone,
      terminal: fact('withdraw-village'),
    },
    {
      key: 'swamp',
      weight: 1,
      objectives: [
        main(
          'route',
          'Localizar acesso ao solar por pistas ou exploração confirmadas.',
          swampDone,
          'Encontrar um caminho para continuar a investigação',
        ),
        {
          ...main(
            'fen',
            'Contato pacífico não obrigatório.',
            fact('fen-contact'),
          ),
          type: 'ALTERNATIVE',
          unavailableWhen: fact('fen-refusal'),
        },
        {
          ...main(
            'refusal',
            'Recusa/hostilidade sem inventar resultados.',
            fact('fen-refusal'),
          ),
          type: 'CONDITIONAL',
          availableWhen: fact('fen-refusal'),
        },
      ],
      completion: swampDone,
      terminal: fact('withdraw-swamp'),
    },
    {
      key: 'manor',
      weight: 2,
      objectives: [
        main(
          'aftermath',
          'Determinar desfechos independentes, sem obrigar ritual.',
          manorDone,
          'Resolver a investigação e registrar suas consequências',
        ),
        {
          ...main(
            'records',
            'Documentos do sanatório enriquecem entendimento.',
            fact('sanatorium-evidence'),
          ),
          type: 'OPTIONAL',
        },
        {
          ...main(
            'rescue',
            'Salvar todos não é requisito de um desfecho válido.',
            fact('children-accounted'),
          ),
          type: 'OPTIONAL',
        },
        {
          ...main(
            'ritual',
            'Banimento não resolve Erila ou haints automaticamente.',
            {
              type: 'EVENT',
              eventType: 'GLOAMHALE_RITUAL_PROGRESS',
              equals: { completed: true },
            },
          ),
          type: 'OPTIONAL',
        },
      ],
      milestones: [
        { key: 'survivors', weight: 1, completion: fact('children-accounted') },
        { key: 'outcome', weight: 1, completion: manorDone },
      ],
      completion: manorDone,
      terminal: any(manorDone, fact('withdraw-manor')),
    },
  ],
};
// The optional contact has a dedicated local attestation, not an invented scene option.
revised.progression.facts.push({
  key: 'chant-contact',
  unitKey: 'village',
  description: 'Conversa com Chant ocorreu; medos continuam voluntários.',
  sourcePages: [9, 10],
});
export const gloamhaleV3 = adventureDefinitionSchema.parse(revised);
