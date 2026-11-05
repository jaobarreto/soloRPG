import { validateBlueRoseSheets } from '../../../blue-rose/sheets/sheet-validation';
import type { AdventureModuleDefinition } from '../registry/registry';
import type { sheetSnapshot } from '../state/state';
import type { AdventureDefinition } from '../definitions/definition';
type Snapshot = Awaited<ReturnType<typeof sheetSnapshot>>;

export function validateAdventureParty(
  snapshot: Snapshot,
  definition: AdventureDefinition,
) {
  const errors: string[] = [];
  const reviews = [
    'Conferir origem dos atributos, benefícios de povo/antecedente, escolhas de arcanos e pré-requisitos com as fichas-fonte. A transcrição não prova criação legal.',
    'Arcanos além de Curar narrativo, Convicção, Bonds, Stunts não implementados e encontros especiais requerem operador local; a IA não adjudica regras.',
    'Conferir o tamanho de grupo definido pela aventura e cada ficha, sem escolher ações da protagonista.',
  ];
  const pc = snapshot.cast.filter((c) => c.kind === 'PROTAGONIST');
  if (pc.length !== 1)
    errors.push('Exige exatamente uma protagonista existente.');
  const [minimumParty, maximumParty] = definition.originalPartySize;
  if (
    snapshot.cast.length < minimumParty ||
    snapshot.cast.length > maximumParty
  )
    errors.push(
      `Exige grupo de ${minimumParty}–${maximumParty} integrantes; preparar companheiros ou adaptação explicitamente revisada.`,
    );
  for (const c of snapshot.cast) {
    if (c.level < definition.minimumLevel || c.level > definition.maximumLevel)
      errors.push(`${c.name}: nível fora do intervalo da aventura.`);
  }
  errors.push(...validateBlueRoseSheets(snapshot));
  return { errors, reviews, automaticallyCertified: false as const };
}

export const interactiveReviewNote =
  'A jogadora confirmou as fichas fornecidas na preparação da campanha.';

export const guidedReviewNote =
  'A jogadora conferiu a protagonista e confirmou a composição inicial da sessão.';

export function validateSuppliedIdentity(
  snapshot: Snapshot,
  supplied: AdventureModuleDefinition['suppliedParty'],
) {
  if (!supplied || snapshot.cast.length !== supplied.length)
    return ['A campanha precisa de todas as fichas fornecidas.'];

  return supplied.flatMap((member) => {
    const matches = snapshot.cast.filter((c) => c.name === member.sheet.name);
    const [character] = matches;
    if (
      matches.length !== 1 ||
      !character?.known ||
      character.kind !== member.kind ||
      character.people !== member.sheet.people ||
      character.characterClass !== member.sheet.characterClass
    )
      return [
        `Confira a identidade e o papel de ${member.sheet.name} na campanha.`,
      ];
    if (member.kind !== 'PROTAGONIST') return [];
    const hasWeapon = snapshot.inventory.some(
      ({ entry, item }) =>
        entry.characterId === character.id &&
        entry.quantity > 0 &&
        item.name === member.weaponName &&
        item.equipmentRuleId === member.weapon &&
        item.visibility !== 'GM_ONLY',
    );
    const hasFeatures = member.sheet.features?.every(({ ruleId, degree }) =>
      snapshot.features.some(
        (feature) =>
          feature.characterId === character.id &&
          feature.ruleId === ruleId &&
          feature.degree === (degree ?? null),
      ),
    );
    return hasWeapon && hasFeatures
      ? []
      : [
          `Confira o equipamento e as capacidades autorais de ${character.name}.`,
        ];
  });
}
