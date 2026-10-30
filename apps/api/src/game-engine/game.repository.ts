import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import { characters, checkRequests, diceRolls } from '../database/game-schema';
@Injectable()
export class GameRepository {
  constructor(readonly database: DatabaseService) {}
  async character(
    campaignId: string,
    id: string,
    tx: DatabaseTransaction | DatabaseService['db'] = this.database.db,
  ) {
    const [row] = await tx
      .select()
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.campaignId, campaignId)));
    if (!row) throw new NotFoundException('Character not found');
    return row;
  }
  async visibleCharacter(id: string) {
    const [row] = await this.database.db
      .select()
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.known, true)));
    if (!row) throw new NotFoundException('Character not found');
    return row;
  }
  async check(
    campaignId: string,
    id: string,
    tx: DatabaseTransaction | DatabaseService['db'] = this.database.db,
  ) {
    const [row] = await tx
      .select()
      .from(checkRequests)
      .where(
        and(eq(checkRequests.id, id), eq(checkRequests.campaignId, campaignId)),
      );
    if (!row) throw new NotFoundException('Check request not found');
    return row;
  }
  async visibleRoll(id: string) {
    const [row] = await this.database.db
      .select()
      .from(diceRolls)
      .where(
        and(
          eq(diceRolls.id, id),
          inArray(diceRolls.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      );
    if (!row) throw new NotFoundException('Roll not found');
    return row;
  }
}
