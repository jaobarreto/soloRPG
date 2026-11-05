import { inArray } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../../database/database.service';
import { ruleReferences } from '../../../database/game-schema';
import type {
  AdventureModuleDefinition,
  PartySnapshot,
} from '../registry/registry';

export async function reviewSheets(
  snapshot: PartySnapshot,
  supplied: AdventureModuleDefinition['suppliedParty'],
  tx: DatabaseTransaction,
) {
  const ids = [...new Set(snapshot.features.map((f) => f.ruleId))];
  const references = ids.length
    ? await tx
        .select()
        .from(ruleReferences)
        .where(inArray(ruleReferences.id, ids))
    : [];
  const rules = new Map(references.map((rule) => [rule.id, rule]));
  const order = new Map(
    supplied?.map((member, index) => [member.sheet.name, index]),
  );

  return snapshot.cast
    .filter((c) => c.known)
    .sort(
      (a, b) =>
        (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity),
    )
    .map(
      ({
        id,
        name,
        kind,
        people,
        characterClass,
        level,
        description,
        background,
      }) => {
        const health = snapshot.resources.find(
          (r) => r.characterId === id && r.name === 'HEALTH',
        );
        const profile = snapshot.profiles.find((p) => p.characterId === id);
        return {
          name,
          kind,
          people,
          characterClass,
          level,
          description,
          background,
          health: health
            ? { current: health.current, maximum: health.maximum }
            : null,
          abilities: Object.fromEntries(
            snapshot.abilities
              .filter((a) => a.characterId === id)
              .map(({ ability, score }) => [ability, score]),
          ),
          features: snapshot.features
            .filter((f) => f.characterId === id)
            .map((f) => ({
              name: rules.get(f.ruleId)!.name,
              kind: rules.get(f.ruleId)!.kind,
              degree: f.degree,
              improved: f.improved,
            })),
          equipment: snapshot.inventory
            .filter(
              ({ entry, item }) =>
                entry.characterId === id &&
                entry.quantity > 0 &&
                item.visibility !== 'GM_ONLY',
            )
            .map(({ entry, item }) => ({
              name: item.name,
              quantity: entry.quantity,
              equipped: entry.equipped,
            })),
          armor: profile?.armorType ?? null,
          shield: profile?.shieldType ?? null,
        };
      },
    );
}
