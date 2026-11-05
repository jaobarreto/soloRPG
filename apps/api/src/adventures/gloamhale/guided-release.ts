import { roadObjects } from './road-objects';
import { travelOpening } from './travel-opening';
import { gloamhaleNarrativePlanning } from './narrative-planning';
import type { GuidedRelease } from '../core/registry/registry';

// The single local player's library slot is independent of earlier manual campaigns.
export const gloamhaleGuidedRelease: GuidedRelease = {
  campaignId: 'ced46cbf-85bc-41af-afb7-962af84c9faa',
  genre: 'Fantasia e Mistério',
  system: 'Blue Rose',
  narrator: 'Una',
  presentation:
    'A caminho de Lakesheart, uma carroça tombada interrompe a viagem. À beira da estrada, moradores aguardam ajuda.',
  releasedSessions: [1],
  planning: gloamhaleNarrativePlanning,
  sceneObjects: [roadObjects],
  opening: {
    revision: 'gloamhale-travel-a1-3-v1',
    source: 'APPROVED_TEXT',
    sceneKey: 'foiled-trap',
    text: travelOpening,
    planningRevision: gloamhaleNarrativePlanning.revision,
  },
  interactionPhrases: {
    'Perguntar aos moradores o que aconteceu': [
      'O que aconteceu?',
      'Vocês podem me contar o que aconteceu?',
      'Meu nome é Naelis. Vocês podem me contar o que aconteceu?',
    ],
    'Seguir para Lakesheart': ['Sigo para Lakesheart.', 'Vou para Lakesheart.'],
    'Decidir investigar os desaparecimentos': [
      'Decido investigar os desaparecimentos.',
    ],
  },
  directRoute: {
    revision: 'a1-1-direct-route-1',
    sceneKey: 'foiled-trap',
    contactOptionKey: 'ask-villagers',
    optionKey: 'guided-direct-route',
    factKey: 'village-route',
    intent: 'Seguir diretamente ao pântano',
    playerText: 'Escolho seguir diretamente ao pântano.',
    receipt: 'Você escolheu seguir diretamente ao pântano.',
  },
  companions: {
    aren: {
      role: 'Patrulheiro',
      personality: 'Paciente, prudente e cooperativo.',
      presentation:
        'Emissário dos Melhores do Soberano e veterano da Guarda Aldina.',
    },
    mira: {
      role: 'Batedora',
      personality: 'Calorosa, curiosa e expressiva.',
      presentation:
        'Emissária dos Melhores do Soberano, atenta a caminhos e rastros.',
    },
    lys: {
      role: 'Mediadora',
      personality: 'Reservada, disciplinada e precisa.',
      presentation: 'Emissária aldina com formação em mediação e registros.',
    },
  },
};
