import { adventureDefinitionSchema } from '../../../core/definitions/definition';
import { gloamhaleV3 } from '../v3/gloamhale-v3';

const revised = structuredClone(gloamhaleV3);
revised.version = 4;

const descriptions: Record<string, string> = {
  study:
    'Estantes cheias cercam uma escrivaninha com pilhas de papéis e pastas.',
  'dining-room': 'Uma mesa de carvalho está posta com pratos fumegantes.',
  'mistress-bedroom':
    'Flores cobrem a cama. Sobre a penteadeira, o espelho está empoeirado.',
  swamp: 'A lama prende os passos sob a vegetação cerrada.',
  cellar: 'Corredores estreitos separam pequenas celas com camas e baldes.',
  'wine-cellar':
    'Sussurros cercam tonéis deteriorados e gaiolas meio enterradas.',
  playroom:
    'A luz atravessa as cortinas. Baús fechados cercam um desenho no piso.',
  attic: 'Entre celas improvisadas, duas crianças muito magras se encolhem.',
};
for (const location of revised.locations) {
  if (descriptions[location.key])
    location.description = descriptions[location.key]!;
}
const openings: Record<string, string> = {
  'losing-chant':
    'Enit chama por Chant do alpendre. A menina não está à vista.',
  erila: descriptions['mistress-bedroom']!,
  study: descriptions.study!,
  feast: descriptions['dining-room']!,
  grotto: 'Hera cobre o abrigo de pedra. Há pequenas lápides no terreno.',
  ritual: 'Cinco velas cercam o desenho no piso da sala de brinquedos.',
};
for (const scene of revised.scenes) {
  if (openings[scene.key]) scene.opening = openings[scene.key]!;
}
export const gloamhaleV4 = adventureDefinitionSchema.parse(revised);
