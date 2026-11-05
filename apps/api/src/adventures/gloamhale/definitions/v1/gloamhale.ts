import { scenes } from './scenes';
import { encounters } from './encounters';
import { locations } from './locations';
import { characters } from './npcs';
// Operational paraphrases for private play; printed pages, PDF index = page + 1.
import { adventureDefinitionSchema } from '../../../core/definitions/definition';
export const gloamhale = adventureDefinitionSchema.parse({
  id: 'six-of-swords-gloamhale',
  version: 1,
  title: 'The Mistress of Gloamhale Manor',
  sourceBook: 'Blue Rose: Six of Swords (2017)',
  sourcePages: [
    6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 28, 29,
  ],
  minimumLevel: 1,
  maximumLevel: 4,
  originalPartySize: [4, 6],
  synopsis:
    'Em Lakesheart, desaparecimentos de crianças agravam a tensão com os Fen após a drenagem do lago Husqan.',
  centralConflict:
    'Investigar a assombração do antigo sanatório e interromper o ciclo de sofrimento, preservando a liberdade das escolhas e as consequências entre comunidades.',
  characters,
  locations,
  encounters,
  scenes,
  sessions: [
    {
      number: 1,
      title: 'A estrada e a vila',
      targetMinutes: 120,
      mainObjective: 'Compreender a situação de Lakesheart.',
      secondaryObjectives: ['Preservar autonomia, recursos e continuidade.'],
      sceneKeys: [
        'foiled-trap',
        'fen-attack',
        'village',
        'chant-talk',
        'dawning-dark',
        'losing-chant',
      ],
      milestones: [
        'Ouvir os moradores; conhecer Chant se houver oportunidade.',
      ],
      completionCriteria: [
        'Registrar relatos obtidos e decisão sobre investigação.',
      ],
      possibleEndings: [
        'Permanecer na vila; seguir uma pista; recusar o chamado.',
      ],
    },
    {
      number: 2,
      title: 'Vozes do pântano',
      targetMinutes: 120,
      mainObjective: 'Investigar o outro lado do conflito.',
      secondaryObjectives: ['Preservar autonomia, recursos e continuidade.'],
      sceneKeys: [
        'fens-beckon',
        'mud-mother',
        'fen-vanish',
        'murder',
        'harvest',
        'rhyme',
        'plantation',
      ],
      milestones: ['Ouvir os Fen; distinguir acusações e evidências.'],
      completionCriteria: [
        'Registrar contato ou recusa e consequências; decidir o próximo passo.',
      ],
      possibleEndings: [
        'Rumo ao solar; retorno à vila; afastamento do conflito.',
      ],
    },
    {
      number: 3,
      title: 'Os vestígios do sanatório',
      targetMinutes: 120,
      mainObjective: 'Explorar as evidências iniciais do solar.',
      secondaryObjectives: ['Preservar autonomia, recursos e continuidade.'],
      sceneKeys: ['reborn', 'parlor', 'piano', 'fruit', 'haints', 'study'],
      milestones: [
        'Investigar o passado; lidar com espíritos individualmente.',
      ],
      completionCriteria: [
        'Registrar descobertas, condições e localização ao parar.',
      ],
      possibleEndings: ['Retirada; abrigo; exploração pendente.'],
    },
    {
      number: 4,
      title: 'A casa e seus perigos',
      targetMinutes: 120,
      mainObjective: 'Lidar com as manifestações da casa.',
      secondaryObjectives: ['Preservar autonomia, recursos e continuidade.'],
      sceneKeys: ['kitchen', 'feast', 'master'],
      milestones: ['Identificar perigos e possíveis recursos de ajuda.'],
      completionCriteria: ['Registrar efeitos em vigor, objetos e decisões.'],
      possibleEndings: [
        'Pausa segura; retorno à gruta; seguir ao andar superior.',
      ],
    },
    {
      number: 5,
      title: 'Vozes e sobreviventes',
      targetMinutes: 120,
      mainObjective: 'Investigar o andar superior e procurar sobreviventes.',
      secondaryObjectives: ['Preservar autonomia, recursos e continuidade.'],
      sceneKeys: ['erila', 'toys', 'attic'],
      milestones: [
        'Contato com Erila quando cabível; localizar crianças e brinquedos.',
      ],
      completionCriteria: [
        'Registrar conhecimentos individuais, resgate e decisões sobre os espíritos.',
      ],
      possibleEndings: ['Evacuação; preparação; investigação incompleta.'],
    },
    {
      number: 6,
      title: 'Escolhas e consequências',
      targetMinutes: 120,
      mainObjective: 'Decidir como enfrentar a assombração.',
      secondaryObjectives: ['Preservar autonomia, recursos e continuidade.'],
      sceneKeys: ['ritual', 'resolution'],
      milestones: [
        'Avaliar ritual e alternativas; resolver consequências sustentadas.',
      ],
      completionCriteria: [
        'Registrar separadamente destino da casa, crianças, haints, Erila e Jaymes.',
      ],
      possibleEndings: [
        'Banimento; interrupção; inundação; incêndio; retirada.',
      ],
    },
  ],
  endings: [
    {
      key: 'haints-freed',
      condition: 'Todos os haints foram libertados por compaixão/presentes.',
      consequence:
        'As almas seguem ao renascimento; desaparecimentos cessam e natalidade se recupera.',
      sourcePages: [26],
    },
    {
      key: 'haints-remain',
      condition: 'Há haints não libertados.',
      consequence:
        'Desaparecimentos continuam; o conflito entre vila e Fen pode tornar-se guerra.',
      sourcePages: [26],
    },
    {
      key: 'erila-freed',
      condition: 'Todos os haints libertos e mansão destruída.',
      consequence: 'Erila é libertada.',
      sourcePages: [26],
    },
    {
      key: 'erila-bound',
      condition: 'Condições para libertação de Erila não cumpridas.',
      consequence: 'Erila permanece presa.',
      sourcePages: [26],
    },
    {
      key: 'flood',
      condition: 'A casa é inundada.',
      consequence:
        'Forma adulta retorna; incidentes cessam, com risco se a área voltar a ser drenada.',
      sourcePages: [26],
    },
    {
      key: 'fire',
      condition: 'A casa é incendiada.',
      consequence:
        'Forma adulta retorna; espectro e poltergeists se desfazem, mas outros espíritos precisam de resolução própria.',
      sourcePages: [26],
    },
    {
      key: 'banishment',
      condition: 'Ritual concluído.',
      consequence:
        'Jaymes não pode retornar; Erila e haints não libertados permanecem.',
      sourcePages: [26],
    },
    {
      key: 'interrupted',
      condition: 'Ritual interrompido voluntariamente.',
      consequence:
        'Nova tentativa vedada; Jaymes pode se recuperar em meses ou anos.',
      sourcePages: [26],
    },
  ],
});
