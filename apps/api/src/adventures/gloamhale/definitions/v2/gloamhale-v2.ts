import { adventureDefinitionSchema } from '../../../core/definitions/definition';
import { gloamhale } from '../v1/gloamhale';

// A new definition version: existing v1 imports and their digests are immutable.
// Durations below are explicit SoloRPG pacing policies, not official AGE rules.
const revised = structuredClone(gloamhale);
revised.version = 2;
const road = revised.scenes.find((scene) => scene.key === 'foiled-trap')!;
road.options[0]!.durationMinutes = 5;
road.options.push({
  key: 'enter-village',
  intent: 'Seguir para Lakesheart',
  mode: 'ACT',
  keywords: ['lakesheart', 'vila'],
  check: null,
  nextSceneKey: 'village',
  successText: 'O grupo chega a Lakesheart, conforme o caminho escolhido.',
  failureText: 'O grupo permanece na estrada.',
});
const village = revised.scenes.find((scene) => scene.key === 'village')!;
village.opening =
  'Em Lakesheart, os moradores aguardam sua decisão sobre o pedido de ajuda. O que deseja fazer?';
village.options.push({
  key: 'investigate',
  intent: 'Decidir investigar os desaparecimentos',
  mode: 'ACT',
  keywords: ['investigar', 'desaparecimentos'],
  check: null,
  durationMinutes: 5,
  successText:
    'Você decidiu investigar os desaparecimentos. O próximo passo continua sendo sua escolha.',
  failureText: 'A decisão continua em aberto.',
});
village.options.push({
  key: 'return-road',
  intent: 'Retornar à estrada',
  mode: 'ACT',
  keywords: ['estrada', 'retornar'],
  check: null,
  nextSceneKey: 'foiled-trap',
  successText: 'O grupo retorna à estrada, conforme o caminho escolhido.',
  failureText: 'O grupo permanece na vila.',
});
for (const scene of revised.scenes) {
  const encounter = revised.encounters.find(
    (entry) => entry.key === scene.encounterKey,
  )!;
  if (!encounter.blockers.length)
    scene.options.push({
      key: 'cure-self',
      intent: 'Usar Curar em si',
      mode: 'ACT',
      keywords: ['curar'],
      check: null,
      arcana: 'CURE_SELF',
      successText: 'Curar resolvido pelo motor.',
      failureText: 'Curar falhou.',
    });
  if (['ritual', 'resolution'].includes(scene.key))
    scene.endingKeys = revised.endings.map((ending) => ending.key);
}
revised.sessions[0]!.completionEvidence = [
  { sceneKey: 'foiled-trap', optionKey: 'ask-villagers' },
  { sceneKey: 'village', optionKey: 'investigate' },
];
export const gloamhaleV2 = adventureDefinitionSchema.parse(revised);
