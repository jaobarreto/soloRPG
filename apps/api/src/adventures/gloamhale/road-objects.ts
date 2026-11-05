import type { SceneObjectRelease } from '../core/objects/scene-objects';

export const roadObjects: SceneObjectRelease = {
  revision: 'gloamhale-road-objects-c4a-v1',
  objects: [
    {
      key: 'road-overturned-wagon',
      name: 'Carroça tombada',
      aliases: [
        'carroça',
        'carroça tombada',
        'carroça virada',
        'carroça caída',
      ],
      locationKey: 'road',
      presence: 'AFTER_TRAVEL_REVEAL',
      source: { book: 'Six of Swords', page: 7, section: 'A Foiled Trap' },
      initialState: 'OVERTURNED',
      visibleFacts: [
        'A carroça está tombada e bloqueia a estrada.',
        'Há fios mal escondidos.',
      ],
      examinationFacts: ['Os fios atravessam a estrada em frente à carroça.'],
      perceptible:
        'A carroça está tombada, bloqueando a estrada. Há fios mal escondidos na passagem.',
      examined:
        'A carroça tombada bloqueia a passagem. Os fios mal escondidos atravessam a estrada em frente a ela.',
      recognized:
        'A carroça continua tombada, com os mesmos fios atravessados na estrada à frente dela.',
      privateNotes:
        'A investigação da emboscada é separada. O teste de Empatia avalia a sinceridade do relato dos moradores, não a carroça. A fonte não define dono, carga ou material.',
    },
  ],
};
