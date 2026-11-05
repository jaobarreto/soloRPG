import { adventurePlanningSchema } from '../core/director/planning';
import type { Condition } from '../core/director/progression';
import { currentAdventure } from './default-adventure';

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

const contact = any(
  option('foiled-trap', 'ask-villagers'),
  fact('village-route'),
  fact('intro-contact'),
);
const response = all(
  contact,
  any(
    option('village', 'investigate'),
    fact('village-route'),
    fact('intro-response'),
  ),
);

export const gloamhaleNarrativePlanning = adventurePlanningSchema.parse({
  revision: 'gloamhale-editorial-2',
  definitionId: `${currentAdventure.id}:v${currentAdventure.version}`,
  sessions: [
    {
      number: 1,
      key: 'village',
      part: 'The Village',
      title: 'Os desaparecimentos de Lakesheart',
      publicLabel: 'Sessão I',
      sourcePages: [7, 8, 9, 10],
      objectives: [
        {
          key: 'reports',
          title: 'Contato com os desaparecimentos',
          intent: 'Reconhecer o problema e sua importância para os envolvidos.',
        },
        {
          key: 'decision',
          title: 'Primeiras investigações e suspeitas',
          intent:
            'Reagir à situação e definir um rumo com consequência confirmada.',
        },
      ],
      operational: {
        sceneKeys: [
          'foiled-trap',
          'fen-attack',
          'village',
          'chant-talk',
          'dawning-dark',
          'losing-chant',
        ],
        points: { reports: 45, decision: 45 },
        closingPoints: 10,
        unit: {
          key: 'village',
          weight: 1,
          objectives: [
            {
              key: 'reports',
              type: 'MAIN',
              weight: 45,
              description:
                'O contato inicial recebeu uma resposta e produziu evidência oficial.',
              publicDescription: 'Compreender a situação local',
              completion: contact,
            },
            {
              key: 'decision',
              type: 'MAIN',
              weight: 45,
              description:
                'Uma resposta significativa e seu rumo foram confirmados.',
              publicDescription: 'Decidir como prosseguir',
              completion: response,
            },
          ],
          completion: response,
          terminal: fact('withdraw-village'),
        },
        localFacts: [
          {
            key: 'intro-contact',
            unitKey: 'village',
            sourcePages: [7, 8, 9, 10],
            description:
              'Contato alternativo com os desaparecimentos, com resposta significativa e consequência atestadas.',
            proofTypes: [
              'CONSEQUENCE_RECORDED',
              'SPEECH_RECORDED',
              'ENCOUNTER_RECORDED',
            ],
          },
          {
            key: 'intro-response',
            unitKey: 'village',
            sourcePages: [7, 8, 9, 10],
            description:
              'Consequência introdutória e decisão de rumo atestadas, inclusive recuo ou fracasso pertinente.',
            proofTypes: ['CONSEQUENCE_RECORDED', 'ENCOUNTER_RECORDED'],
            requires: contact,
          },
        ],
      },
    },
    {
      number: 2,
      key: 'swamp',
      part: 'The Swamp',
      title: 'Os segredos do pântano',
      publicLabel: 'Sessão II',
      sourcePages: [11, 12, 13, 14],
      objectives: [
        {
          key: 'fen-conflict',
          title: 'Conflito entre Lakesheart e os Fen',
          intent: 'Encontrar o conflito e decidir como reagir.',
        },
        {
          key: 'swamp-investigation',
          title: 'Investigação do pântano',
          intent:
            'Reagir às informações sobre os desaparecimentos. A audiência com Mud Mother é opcional.',
        },
      ],
    },
    {
      number: 3,
      key: 'arrival',
      part: 'The Manor',
      title: 'A chegada a Gloamhale Manor',
      publicLabel: 'Sessão III',
      sourcePages: [14, 15, 16],
      objectives: [
        {
          key: 'grounds',
          title: 'Descoberta da propriedade',
          intent:
            'Encontrar a propriedade e perceber manifestações sobrenaturais.',
        },
        {
          key: 'transformation',
          title: 'Entrada e transformação',
          intent:
            'Vivenciar a entrada e seus efeitos, com consequências mecânicas quando aplicáveis.',
        },
      ],
    },
    {
      number: 4,
      key: 'echoes',
      part: 'The Manor',
      title: 'Os ecos do passado',
      publicLabel: 'Sessão IV',
      sourcePages: [16, 17, 18, 19, 20, 21, 22],
      objectives: [
        {
          key: 'illusions',
          title: 'Perigos e ilusões',
          intent:
            'Encontrar perigos e responder às manifestações da propriedade.',
        },
        {
          key: 'sanatorium',
          title: 'Evidências do sanatório',
          intent:
            'Encontrar indícios do passado e do sofrimento ligado ao lugar.',
        },
      ],
    },
    {
      number: 5,
      key: 'souls',
      part: 'The Manor',
      title: 'As almas esquecidas',
      publicLabel: 'Sessão V',
      sourcePages: [17, 18, 20, 22, 23, 24],
      objectives: [
        {
          key: 'child-spirits',
          title: 'Espíritos infantis',
          intent: 'Confrontar a situação dos espíritos e decidir como agir.',
        },
        {
          key: 'tragedy',
          title: 'Tragédia de Gloamhale',
          intent:
            'Interpretar ou confrontar as informações relevantes sobre a tragédia.',
        },
      ],
    },
    {
      number: 6,
      key: 'truth',
      part: 'The Manor',
      title: 'A verdade e suas consequências',
      publicLabel: 'Sessão VI',
      sourcePages: [23, 24, 25],
      objectives: [
        {
          key: 'missing-children',
          title: 'Destino das crianças desaparecidas',
          intent:
            'Confrontar a situação e considerar auxílio, resgate ou proteção.',
        },
        {
          key: 'threat-alternatives',
          title: 'Alternativas diante da ameaça',
          intent:
            'Considerar caminhos sustentados pelas informações disponíveis.',
        },
      ],
    },
    {
      number: 7,
      key: 'fate',
      part: 'The Manor',
      title: 'O destino de Gloamhale',
      publicLabel: 'Sessão VII',
      sourcePages: [25, 26],
      objectives: [
        {
          key: 'final-decision',
          title: 'Decisão final',
          intent:
            'Executar ou abandonar definitivamente um curso, com consequências reconhecidas.',
        },
        {
          key: 'epilogue',
          title: 'Consequências e epílogo',
          intent:
            'Registrar os destinos, a situação da propriedade e os efeitos nas comunidades.',
        },
      ],
    },
  ],
});
