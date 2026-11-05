import { eq } from 'drizzle-orm';
import { adventureInstances } from '../../../../database/adventure-schema';
import type { NavigationPolicy } from '../../../core/navigation/navigate';
import type { GloamhaleMechanics } from './gloamhale-mechanics';

const aliases: Record<string, string> = {
  manor: 'vestíbulo',
  parlor: 'sala de estar',
  'drawing-room': 'sala de música',
  conservatory: 'estufa',
  cellar: 'porão',
  'wine-cellar': 'adega',
  kitchen: 'cozinha',
  study: 'escritório',
  'dining-room': 'sala de jantar',
  upstairs: 'corredor superior',
  'master-bedroom': 'quarto principal',
  'mistress-bedroom': 'quarto da senhora',
  playroom: 'sala de brinquedos',
  'attic-stairs': 'escada do sótão',
  attic: 'sótão',
  grounds: 'terrenos',
  grotto: 'gruta',
};

function area(location: string) {
  return location === 'grounds'
    ? 'GROUNDS'
    : location === 'grotto'
      ? 'GROTTO'
      : 'MANOR';
}

export const gloamhaleNavigation: NavigationPolicy = {
  aliases,
  protagonistLabel: 'Naelis',
  matchesExit: (text, exit) =>
    exit.edge.key === 'front-door' && exit.reverse && text === 'saio da mansao',
  traversalBlock(loaded, from, to) {
    const mechanics = loaded.instance.mechanics as GloamhaleMechanics | null;
    if (mechanics?.ritual?.status === 'ACTIVE')
      return 'O estado atual exige resolver a situação em andamento antes de atravessar a passagem.';
    if (from === 'manor' && to !== 'grounds' && !mechanics)
      return 'A entrada na mansão ainda exige a confirmação local de Heroes Reborn.';
  },
  async arrive(loaded, destination, tx) {
    const { protagonistId, campaignId } = loaded.instance;
    const mechanics = loaded.instance.mechanics as GloamhaleMechanics | null;
    const child = protagonistId && mechanics?.children[protagonistId];
    if (child) {
      child.location = area(destination);
      await tx
        .update(adventureInstances)
        .set({ mechanics: { ...mechanics } })
        .where(eq(adventureInstances.campaignId, campaignId));
    }
  },
  partyMemberPresent(raw, id, location) {
    const child = (raw as GloamhaleMechanics | null)?.children?.[id];
    return !child || child.location === area(location);
  },
};
