import { BlueRoseTestsService } from '../blue-rose/mechanics/tests/tests.service';
import { BlueRoseCombatService } from '../blue-rose/mechanics/combat/combat.service';
import { BlueRoseArcanaService } from '../blue-rose/arcana/arcana.service';
import { combatStunts } from '../blue-rose/mechanics/combat/combat.rules';
import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  publicCombatSchema,
  publicArcanaRequestSchema,
  publicAdvancedTestSchema,
  publicCharacterSchema,
  publicRollSchema,
  publicCheckRequestSchema,
  publicWorldEntitySchema,
  publicRelationshipSchema,
  publicGameEventSchema,
  gamePageResponseSchema,
  combatActionSchema,
  combatResolveSchema,
  arcanaResolveSchema,
  createCharacterSchema,
  editCharacterSchema,
  inventoryActionSchema,
  checkInputSchema,
  rollInputSchema,
} from '@solo-rpg/shared-contracts';
import { CharactersService } from '../characters/characters.service';
import { GameEngineService } from './game-engine.service';
// Schemas shared with the browser are strict; internal command schemas are never routed.
const bodySchema = (schema: z.ZodType) => ({
  schema: JSON.parse(
    JSON.stringify(
      z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }),
    ),
  ),
});
const paginated = () =>
  applyDecorators(
    ApiQuery({
      name: 'after',
      required: false,
      type: Number,
      description: 'Exclusive visible sequence; default 0',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Page size 1-100; default 30',
    }),
    ApiQuery({
      name: 'sessionId',
      required: false,
      type: String,
      description: 'Optional session UUID in this campaign',
    }),
  );
@ApiTags('Blue Rose AGE / Player')
@Controller()
export class GameEngineController {
  constructor(
    private readonly engine: GameEngineService,
    private readonly queries: CharactersService,
    private readonly combat: BlueRoseCombatService,
    private readonly arcana: BlueRoseArcanaService,
    private readonly tests: BlueRoseTestsService,
  ) {}
  @Post('campaigns/:campaignId/characters')
  @ApiBody(bodySchema(createCharacterSchema))
  @ApiCreatedResponse(bodySchema(publicCharacterSchema))
  async create(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Body() input: unknown,
  ) {
    return this.queries.detail(
      (await this.engine.createCharacter(campaignId, input)).id,
    );
  }
  @Get('campaigns/:campaignId/characters')
  @ApiOkResponse(bodySchema(z.array(publicCharacterSchema)))
  list(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return this.queries.list(campaignId);
  }
  @Get('characters/:id')
  @ApiOkResponse(bodySchema(publicCharacterSchema))
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.queries.detail(id);
  }
  @Patch('characters/:id')
  @ApiBody(bodySchema(editCharacterSchema))
  @ApiOkResponse(bodySchema(publicCharacterSchema))
  async edit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: unknown,
  ) {
    await this.engine.editCharacter(id, input);
    return this.queries.detail(id);
  }
  @Post('characters/:id/inventory/actions')
  @ApiBody(bodySchema(inventoryActionSchema))
  @ApiCreatedResponse(bodySchema(publicCharacterSchema))
  async inventory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: unknown,
  ) {
    await this.engine.inventoryAction(id, input);
    return this.queries.detail(id);
  }
  @Post('campaigns/:campaignId/blue-rose/rolls')
  @ApiBody(bodySchema(rollInputSchema))
  @ApiCreatedResponse(bodySchema(publicRollSchema))
  async roll(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Body() input: unknown,
  ) {
    return this.queries.roll((await this.engine.roll(campaignId, input)).id);
  }
  @Get('campaigns/:campaignId/blue-rose/rolls')
  @paginated()
  @ApiOkResponse(bodySchema(gamePageResponseSchema(publicRollSchema)))
  rolls(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.queries.rolls(campaignId, query);
  }
  @Post('campaigns/:campaignId/blue-rose/checks')
  @ApiBody(bodySchema(checkInputSchema))
  @ApiCreatedResponse(bodySchema(publicRollSchema))
  async check(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Body() input: unknown,
  ) {
    return this.queries.roll((await this.engine.check(campaignId, input)).id);
  }
  @Get('campaigns/:campaignId/blue-rose/requests')
  @ApiOkResponse(bodySchema(z.array(publicCheckRequestSchema)))
  requests(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return Promise.all([
      this.queries.requests(campaignId),
      this.tests.requests(campaignId),
    ]).then((pages) => pages.flat());
  }
  @Get('campaigns/:campaignId/events')
  @paginated()
  @ApiOkResponse(bodySchema(gamePageResponseSchema(publicGameEventSchema)))
  events(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.queries.events(campaignId, query);
  }
  @Get('campaigns/:campaignId/world-state')
  @ApiOkResponse(bodySchema(z.array(publicWorldEntitySchema)))
  world(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return this.queries.world(campaignId);
  }
  @Get('campaigns/:campaignId/relationships')
  @ApiOkResponse(bodySchema(z.array(publicRelationshipSchema)))
  relationships(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return this.queries.relationships(campaignId);
  }
  @Get('blue-rose/rules')
  rules() {
    return this.queries.rules();
  }
  @Get('campaigns/:campaignId/blue-rose/combat')
  @ApiOkResponse(bodySchema(publicCombatSchema.nullable()))
  async combatState(
    @Param('campaignId', new ParseUUIDPipe()) id: string,
    @Res() response: { json(value: unknown): void },
  ) {
    response.json(await this.combat.publicView(id));
  }
  @Post('campaigns/:campaignId/blue-rose/combat/actions')
  @ApiCreatedResponse(bodySchema(publicCombatSchema))
  @ApiBody(bodySchema(combatActionSchema))
  async combatAction(
    @Param('campaignId', new ParseUUIDPipe()) id: string,
    @Body() input: unknown,
  ) {
    await this.engine.combatAction(id, input);
    return this.combat.publicView(id);
  }
  @Post('campaigns/:campaignId/blue-rose/combat/stunts')
  @ApiCreatedResponse(bodySchema(publicCombatSchema))
  @ApiBody(bodySchema(combatResolveSchema))
  async combatResolve(
    @Param('campaignId', new ParseUUIDPipe()) id: string,
    @Body() input: unknown,
  ) {
    await this.engine.resolveStunts(id, input);
    return this.combat.publicView(id);
  }
  @Get('campaigns/:campaignId/blue-rose/arcana/requests')
  @ApiOkResponse(bodySchema(z.array(publicArcanaRequestSchema)))
  arcanaRequests(@Param('campaignId', new ParseUUIDPipe()) id: string) {
    return this.arcana.requests(id);
  }
  @Post('campaigns/:campaignId/blue-rose/arcana/cure')
  @ApiCreatedResponse(bodySchema(z.array(publicCharacterSchema)))
  @ApiBody(bodySchema(arcanaResolveSchema))
  async cure(
    @Param('campaignId', new ParseUUIDPipe()) id: string,
    @Body() input: unknown,
  ) {
    await this.engine.resolveCure(id, input);
    return this.queries.list(id);
  }
  @Get('campaigns/:campaignId/blue-rose/advanced-tests')
  @ApiOkResponse(bodySchema(z.array(publicAdvancedTestSchema)))
  advancedTests(@Param('campaignId', new ParseUUIDPipe()) id: string) {
    return this.tests.tasks(id);
  }
  @Get('blue-rose/stunts')
  stunts() {
    return {
      implemented: Object.entries(combatStunts).map(([id, value]) => ({
        id,
        ...value,
        source: 'Blue Rose AGE BR 2023 pp.23-24',
      })),
      status: 'PARTIAL',
      scope:
        'Supported baseline combat; once per round, immediate attack resolution. Other Stunts remain pending.',
    };
  }
}
