import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  type GamePage,
  type PublicCharacter,
  type PublicRoll,
  type PublicGameEvent,
  type PublicRelationship,
  type PublicWorldEntity,
  type PublicCheckRequest,
  gamePageSchema,
} from '@solo-rpg/shared-contracts';
import { DatabaseService } from '../database/database.service';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import * as s from '../database/game-schema';
import { campaignSessions } from '../database/schema';
import { GameRepository } from '../database/game.repository';
import { BlueRoseCombatService } from '../blue-rose/mechanics/combat/combat.service';
import { parseInput } from '../game-engine/validation';

type PageQuery = ReturnType<typeof gamePageSchema.parse>;
const visible = ['PUBLIC', 'PLAYER_ONLY'] as const;
@Injectable()
export class CharactersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly campaigns: CampaignsRepository,
    private readonly repository: GameRepository,
    private readonly combat: BlueRoseCombatService,
  ) {}
  private async campaign(id: string) {
    if (!(await this.campaigns.find(id)))
      throw new NotFoundException('Campaign not found');
  }
  async list(campaignId: string): Promise<PublicCharacter[]> {
    await this.campaign(campaignId);
    const rows = await this.database.db
      .select({ id: s.characters.id })
      .from(s.characters)
      .where(
        and(
          eq(s.characters.campaignId, campaignId),
          eq(s.characters.known, true),
        ),
      )
      .orderBy(s.characters.createdAt, s.characters.id);
    return Promise.all(rows.map((row) => this.detail(row.id)));
  }
  async detail(id: string): Promise<PublicCharacter> {
    return this.database.db.transaction(
      async (tx) => {
        const [row] = await tx
          .select()
          .from(s.characters)
          .where(and(eq(s.characters.id, id), eq(s.characters.known, true)));
        if (!row) throw new NotFoundException('Character not found');
        const scores = await tx
          .select()
          .from(s.characterAbilities)
          .where(eq(s.characterAbilities.characterId, id));
        const resources = await tx
          .select({
            name: s.characterResources.name,
            current: s.characterResources.current,
            maximum: s.characterResources.maximum,
          })
          .from(s.characterResources)
          .where(eq(s.characterResources.characterId, id))
          .orderBy(
            sql`CASE WHEN ${s.characterResources.name} = 'HEALTH' THEN 0 ELSE 1 END`,
            s.characterResources.name,
          );
        const features = await tx
          .select({
            ruleId: s.ruleReferences.id,
            name: s.ruleReferences.name,
            kind: s.ruleReferences.kind,
            degree: s.characterFeatures.degree,
            improved: s.characterFeatures.improved,
            status: s.ruleReferences.status,
          })
          .from(s.characterFeatures)
          .innerJoin(
            s.ruleReferences,
            eq(s.characterFeatures.ruleId, s.ruleReferences.id),
          )
          .where(eq(s.characterFeatures.characterId, id))
          .orderBy(s.ruleReferences.id);
        const details = await tx
          .select()
          .from(s.characterDetails)
          .where(eq(s.characterDetails.characterId, id))
          .orderBy(s.characterDetails.value);
        const conditions = await tx
          .select({
            id: s.characterConditions.id,
            name: s.characterConditions.name,
            description: s.characterConditions.description,
          })
          .from(s.characterConditions)
          .where(
            and(
              eq(s.characterConditions.characterId, id),
              inArray(s.characterConditions.visibility, visible),
            ),
          )
          .orderBy(s.characterConditions.createdAt, s.characterConditions.id);
        const items = await tx
          .select({
            itemId: s.gameItems.id,
            name: s.gameItems.name,
            description: s.gameItems.description,
            quantity: s.inventory.quantity,
            equipped: s.inventory.equipped,
            consumable: s.gameItems.consumable,
          })
          .from(s.inventory)
          .innerJoin(s.gameItems, eq(s.inventory.itemId, s.gameItems.id))
          .where(
            and(
              eq(s.inventory.characterId, id),
              gt(s.inventory.quantity, 0),
              inArray(s.gameItems.visibility, visible),
            ),
          )
          .orderBy(s.gameItems.name, s.gameItems.id);
        const [vitals] = await tx
          .select()
          .from(s.characterVitals)
          .where(eq(s.characterVitals.characterId, id));
        return {
          fatigueLevel: vitals?.fatigueLevel ?? 0,
          lifeState: vitals?.lifeState ?? 'ALIVE',
          id: row.id,
          campaignId: row.campaignId,
          name: row.name,
          description: row.description,
          kind: row.kind,
          people: row.people,
          characterClass: row.characterClass,
          background: row.background,
          level: row.level,
          calling: row.calling,
          destiny: row.destiny,
          fate: row.fate,
          personality: row.personality,
          motivations: row.motivations,
          state: row.state,
          abilities: Object.fromEntries(
            scores.map((a) => [a.ability, a.score]),
          ) as PublicCharacter['abilities'],
          resources,
          features,
          languages: details
            .filter((d) => d.kind === 'LANGUAGE')
            .map((d) => d.value),
          goals: details.filter((d) => d.kind === 'GOAL').map((d) => d.value),
          conditions,
          inventory: items,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async roll(id: string): Promise<PublicRoll> {
    const result = this.projectRoll(await this.repository.visibleRoll(id));
    return {
      ...result,
      availableStuntPoints: await this.combat.availablePoints(id),
    };
  }
  private projectRoll(row: typeof s.diceRolls.$inferSelect): PublicRoll {
    if (row.visibility === 'GM_ONLY')
      throw new NotFoundException('Roll not found');
    return {
      id: row.id,
      sessionId: row.sessionId,
      characterId: row.characterId,
      dice: [row.die1, row.die2, row.dramaDie],
      dramaDie: row.dramaDie,
      modifier: row.modifier,
      total: row.total,
      success: row.success,
      stuntPoints: row.stuntPoints,
      availableStuntPoints: 0,
      reason: row.reason,
      visibility: row.visibility,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private page<T>(
    rows: T[],
    query: PageQuery,
    cursor: (row: T) => number,
  ): GamePage<T> {
    const hasMore = rows.length > query.limit,
      data = rows.slice(0, query.limit);
    return {
      data,
      hasMore,
      nextCursor: hasMore ? cursor(data[data.length - 1]!) : null,
    };
  }
  private async query(campaignId: string, input: unknown) {
    await this.campaign(campaignId);
    const query = parseInput(gamePageSchema, input);
    if (query.sessionId) {
      const [session] = await this.database.db
        .select({ id: campaignSessions.id })
        .from(campaignSessions)
        .where(
          and(
            eq(campaignSessions.id, query.sessionId),
            eq(campaignSessions.campaignId, campaignId),
          ),
        );
      if (!session)
        throw new NotFoundException('Session not found in campaign');
    }
    return query;
  }
  async rolls(
    campaignId: string,
    input: unknown,
  ): Promise<GamePage<PublicRoll>> {
    const query = await this.query(campaignId, input);
    const rows = await this.database.db
      .select()
      .from(s.diceRolls)
      .where(
        and(
          eq(s.diceRolls.campaignId, campaignId),
          inArray(s.diceRolls.visibility, visible),
          gt(s.diceRolls.publicSequence, query.after),
          query.sessionId
            ? eq(s.diceRolls.sessionId, query.sessionId)
            : undefined,
        ),
      )
      .orderBy(s.diceRolls.publicSequence)
      .limit(query.limit + 1);
    const page = this.page(rows, query, (r) => r.publicSequence!);
    return {
      ...page,
      data: await Promise.all(page.data.map((r) => this.roll(r.id))),
    };
  }
  async requests(campaignId: string): Promise<PublicCheckRequest[]> {
    await this.campaign(campaignId);
    // Only protagonist requests in an active session are actionable by the browser.
    return this.database.db
      .select({
        id: s.checkRequests.id,
        characterId: s.checkRequests.characterId,
        ability: s.checkRequests.ability,
        focusId: s.checkRequests.focusId,
        reason: s.checkRequests.reason,
      })
      .from(s.checkRequests)
      .innerJoin(s.characters, eq(s.characters.id, s.checkRequests.characterId))
      .innerJoin(
        campaignSessions,
        eq(campaignSessions.id, s.checkRequests.sessionId),
      )
      .where(
        and(
          eq(s.checkRequests.campaignId, campaignId),
          eq(s.checkRequests.resolved, false),
          inArray(s.checkRequests.visibility, visible),
          eq(s.characters.known, true),
          eq(s.characters.kind, 'PROTAGONIST'),
          eq(campaignSessions.status, 'IN_PROGRESS'),
        ),
      )
      .orderBy(s.checkRequests.createdAt, s.checkRequests.id);
  }
  async events(
    campaignId: string,
    input: unknown,
  ): Promise<GamePage<PublicGameEvent>> {
    const query = await this.query(campaignId, input);
    const rows = await this.database.db
      .select()
      .from(s.gameEvents)
      .where(
        and(
          eq(s.gameEvents.campaignId, campaignId),
          inArray(s.gameEvents.visibility, visible),
          gt(s.gameEvents.publicSequence, query.after),
          query.sessionId
            ? eq(s.gameEvents.sessionId, query.sessionId)
            : undefined,
        ),
      )
      .orderBy(s.gameEvents.publicSequence)
      .limit(query.limit + 1);
    const page = this.page(rows, query, (r) => r.publicSequence!);
    const participants = page.data.length
      ? await this.database.db
          .select()
          .from(s.eventParticipants)
          .where(
            inArray(
              s.eventParticipants.eventId,
              page.data.map((r) => r.id),
            ),
          )
      : [];
    return {
      ...page,
      data: page.data.map((row) => ({
        id: row.id,
        sequence: row.publicSequence!,
        sessionId: row.sessionId,
        type: row.type,
        description: row.description,
        changes: row.changes,
        participants: participants
          .filter((p) => p.eventId === row.id)
          .map((p) => p.characterId),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
  async world(campaignId: string): Promise<PublicWorldEntity[]> {
    await this.campaign(campaignId);
    return this.database.db
      .select({
        id: s.worldEntities.id,
        kind: s.worldEntities.kind,
        name: s.worldEntities.name,
        description: s.worldEntities.description,
        status: s.worldEntities.status,
        accessible: s.worldEntities.accessible,
      })
      .from(s.worldEntities)
      .where(
        and(
          eq(s.worldEntities.campaignId, campaignId),
          inArray(s.worldEntities.visibility, visible),
        ),
      )
      .orderBy(s.worldEntities.name, s.worldEntities.id);
  }
  async relationships(campaignId: string): Promise<PublicRelationship[]> {
    await this.campaign(campaignId);
    return this.database.db
      .select({
        fromCharacterId: s.relationships.fromCharacterId,
        toCharacterId: s.relationships.toCharacterId,
        metric: s.relationships.metric,
        value: s.relationships.value,
        minimum: s.relationshipMetrics.minimum,
        maximum: s.relationshipMetrics.maximum,
        reason: s.relationships.reason,
      })
      .from(s.relationships)
      .innerJoin(
        s.relationshipMetrics,
        and(
          eq(s.relationshipMetrics.campaignId, s.relationships.campaignId),
          eq(s.relationshipMetrics.name, s.relationships.metric),
        ),
      )
      .where(
        and(
          eq(s.relationships.campaignId, campaignId),
          inArray(s.relationships.visibility, visible),
          sql`EXISTS (SELECT 1 FROM characters a WHERE a.id = ${s.relationships.fromCharacterId} AND a.known)`,
          sql`EXISTS (SELECT 1 FROM characters b WHERE b.id = ${s.relationships.toCharacterId} AND b.known)`,
        ),
      )
      .orderBy(
        s.relationships.fromCharacterId,
        s.relationships.toCharacterId,
        s.relationships.metric,
      );
  }
  rules() {
    return this.database.db
      .select()
      .from(s.ruleReferences)
      .orderBy(s.ruleReferences.kind, s.ruleReferences.name);
  }
}
