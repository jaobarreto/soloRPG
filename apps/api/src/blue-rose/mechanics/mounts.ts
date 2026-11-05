import { and, eq } from 'drizzle-orm';
import type {
  DatabaseService,
  DatabaseTransaction,
} from '../../database/database.service';
import * as g from '../../database/game-schema';

export const horse = {
  source: 'Blue Rose AGE, Jambô, p. 335, Cavalo',
  health: 45,
  defense: 10,
  speed: 18,
  armor: 0,
  abilities: {
    FIGHTING: 0,
    COMMUNICATION: -3,
    CONSTITUTION: 6,
    DEXTERITY: 0,
    STRENGTH: 5,
    INTELLIGENCE: -3,
    PERCEPTION: 1,
    ACCURACY: 0,
    WILLPOWER: 1,
  },
  focuses: [
    'Força (Potência)',
    'Constituição (Corrida, Vigor)',
    'Percepção (Audição)',
    'Precisão (Coice)',
  ],
  attack: { name: 'Coice', bonus: 2, damage: '1d6+5' },
  favoredStunts: ['Derrubar', 'Escaramuça'],
} as const;

export async function registerHorse(
  scope: {
    id: string;
    campaignId: string;
    riderId: string;
    locationId: string;
    riderName: string;
  },
  tx: DatabaseTransaction,
) {
  const { id, campaignId, riderId, locationId, riderName } = scope;
  await tx.insert(g.characters).values({
    id,
    campaignId,
    name: `Cavalo de ${riderName}`,
    kind: 'NPC',
    known: true,
    people: 'Cavalo',
    level: 1,
    background: '',
  });
  await tx.insert(g.characterResources).values({
    characterId: id,
    name: 'HEALTH',
    current: horse.health,
    maximum: horse.health,
  });
  await tx.insert(g.characterVitals).values({ characterId: id });
  await tx.insert(g.characterAbilities).values(
    (Object.keys(horse.abilities) as (keyof typeof horse.abilities)[]).map(
      (ability) => ({
        characterId: id,
        ability,
        score: horse.abilities[ability],
      }),
    ),
  );
  await tx.insert(g.combatProfiles).values({
    characterId: id,
    baseSpeed: horse.speed,
    armorType: 'NONE',
    armorTrained: false,
    shieldType: 'NONE',
    shieldTrained: false,
  });
  await tx.insert(g.campaignMounts).values({
    campaignId,
    characterId: id,
    riderId,
    locationId,
    mounted: true,
  });
}

export async function publicMounts(
  campaignId: string,
  tx: DatabaseService['db'] | DatabaseTransaction,
) {
  const rows = await tx
    .select({
      id: g.characters.id,
      name: g.characters.name,
      health: g.characterResources.current,
      maxHealth: g.characterResources.maximum,
      lifeState: g.characterVitals.lifeState,
      mounted: g.campaignMounts.mounted,
      location: g.worldEntities.name,
    })
    .from(g.campaignMounts)
    .innerJoin(g.characters, eq(g.characters.id, g.campaignMounts.characterId))
    .innerJoin(
      g.characterVitals,
      eq(g.characterVitals.characterId, g.characters.id),
    )
    .innerJoin(
      g.characterResources,
      and(
        eq(g.characterResources.characterId, g.characters.id),
        eq(g.characterResources.name, 'HEALTH'),
      ),
    )
    .innerJoin(
      g.worldEntities,
      eq(g.worldEntities.id, g.campaignMounts.locationId),
    )
    .where(eq(g.campaignMounts.campaignId, campaignId));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      mounted: row.mounted && row.lifeState === 'ALIVE' && row.health > 0,
      stats: horse,
      conditions: await tx
        .select({ name: g.characterConditions.name })
        .from(g.characterConditions)
        .where(
          and(
            eq(g.characterConditions.characterId, row.id),
            eq(g.characterConditions.visibility, 'PUBLIC'),
          ),
        ),
    })),
  );
}
